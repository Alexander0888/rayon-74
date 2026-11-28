import { useCallback, useRef, useState } from 'react';
import { visitPublication as copy } from '../../content/fr.js';
import { supabase } from '../../services/supabase.js';
import { sameLayout } from './layoutHistory.js';
import { defaultVisitLayout, parseLayout } from './layoutStorage.js';

export function useVisitPublication(canPublish) {
  const session = useRef(null);
  const inFlight = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState(null);

  const open = useCallback(async (signal) => {
    if (!supabase) return undefined;
    if (session.current) return session.current.draft;

    try {
      const { data, error } = await supabase.from('published_visit_layout')
        .select('layout,revision').eq('id', 1).abortSignal(signal).single();
      if (error || !Number.isSafeInteger(data?.revision)) throw new Error();
      const saved = data.layout === null ? defaultVisitLayout() : parseLayout(JSON.stringify(data.layout));
      if (!saved) throw new Error();
      if (!signal.aborted) {
        session.current = { revision: data.revision, saved, draft: saved };
        setLoadFailed(false);
      }
      return saved;
    } catch {
      if (!signal.aborted) setLoadFailed(true);
      return defaultVisitLayout();
    }
  }, []);

  const change = useCallback((layout) => {
    const current = session.current;
    if (!current) return;
    current.draft = layout;
    setDirty(!sameLayout(layout, current.saved));
    setNotice(null);
  }, []);

  async function save() {
    const current = session.current;
    if (!canPublish || !current || inFlight.current || sameLayout(current.draft, current.saved)) return false;
    const snapshot = current.draft;
    inFlight.current = true;
    setSaving(true);
    setNotice(null);
    try {
      const layout = parseLayout(JSON.stringify(snapshot));
      if (!layout) throw new Error();
      const { data, error } = await supabase.rpc('publish_visit_layout', {
        expected_revision: current.revision,
        snapshot: layout,
      }).select('revision').single();
      if (error) throw error;
      if (data?.revision !== current.revision + 1) throw new Error();
      current.revision = data.revision;
      current.saved = snapshot;
      const clean = sameLayout(current.draft, snapshot);
      setDirty(!clean);
      setNotice({ message: copy.saved });
      return clean;
    } catch (error) {
      setNotice({ message: error?.code === 'PT409' ? copy.conflict : copy.saveFailed, error: true });
      return false;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  function discard() {
    const saved = session.current?.saved;
    if (saved) change(saved);
    return saved;
  }

  return { shared: Boolean(supabase), dirty, saving, loadFailed, notice, open, change, save, discard };
}
