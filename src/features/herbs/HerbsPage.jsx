import { useEffect, useState } from 'react';
import { Eye, Pencil } from 'lucide-react';
import { HerbPicker, TemplateBar } from './components/EditorControls.jsx';
import { Legend } from './components/Legend.jsx';
import { PlanDialog } from '../../components/PlanDialog.jsx';
import { AppHeader } from '../../app/AppHeader.jsx';
import { SectionBreadcrumb } from '../../app/SectionBreadcrumb.jsx';
import { useBlocker, useOutletContext } from 'react-router';
import { Stand } from './components/Stand.jsx';
import { fr, pageTitle } from '../../content/fr.js';
import { copyTemplate, emptySlots, MAX_NAME_LENGTH, sameTemplate } from './data/plans.js';
import { localWorkspace } from './data/localWorkspace.js';
import { createSharedPlanStore } from './data/sharedPlanStore.js';
import { supabase } from '../../services/supabase.js';

const sharedWorkspace = supabase && createSharedPlanStore(supabase);

function withPublished(state, published) {
  if (!state || (state.published && (!published || state.published.revision > published.revision))) return state;
  return { ...state, published };
}

export default function HerbsPage() {
  const { workspaceKey, ...account } = useOutletContext();
  return <Workspace key={workspaceKey} repository={sharedWorkspace || localWorkspace} {...account} />;
}

function Workspace({ repository, canEdit, startEditing, signIn, signOut, signOutError }) {
  const [plans, setPlans] = useState(null);
  const [mode, setMode] = useState(startEditing ? 'edit' : 'view');
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState(undefined);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [connected, setConnected] = useState(true);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const shared = Boolean(repository.watchPublished);

  const saved = draft && plans?.templates.find(({ id }) => id === draft.id);
  const dirty = Boolean(saved && !sameTemplate(draft, saved));
  const editing = canEdit && mode === 'edit';
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    (dirty || pending) && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    document.title = pageTitle(editing ? fr.editTitle : fr.brand);
  }, [editing]);

  // Finish a requested navigation only after a successful save. A failed save
  // leaves the dirty draft in place and offers the usual discard confirmation.
  useEffect(() => {
    if (blocker.state === 'blocked' && !pending && !dirty) blocker.proceed();
  }, [blocker, dirty, pending]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const initial = await repository.load(canEdit);
        if (cancelled) return;
        setPlans(initial);
        const first = initial.templates[0];
        setDraft(first ? copyTemplate(first) : null);
      } catch {
        if (!cancelled) setNotice({ message: shared ? fr.connectionError : fr.storageError, error: true });
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [attempt, canEdit, repository, shared]);

  const loaded = plans !== null;
  useEffect(() => {
    if (!shared || !loaded) return;

    let cancelled = false;
    let latestRequest = 0;

    async function refresh() {
      const request = ++latestRequest;
      try {
        const published = await repository.loadPublished();
        if (cancelled || request !== latestRequest) return;
        setPlans((current) => withPublished(current, published));
        setRefreshFailed(false);
      } catch {
        if (!cancelled && request === latestRequest) setRefreshFailed(true);
      }
    }

    function connectionChanged(isConnected) {
      if (!cancelled) setConnected(isConnected);
    }

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') void refresh();
    }

    const unsubscribe = repository.watchPublished(refresh, connectionChanged);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    // Periodically recover from missed notifications, including suspended mobile tabs.
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.clearInterval(interval);
    };
  }, [loaded, repository, shared]);

  useEffect(() => {
    if (!dirty && !pending) return;
    function warn(event) {
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);

  function openDialog(options) {
    setDialog({ descriptions: [], ...options });
  }

  function leaveDraft(next) {
    if (!dirty) {
      next();
      return;
    }
    openDialog({
      title: fr.discardTitle,
      descriptions: [fr.discardDescription],
      action: fr.discard,
      danger: true,
      confirm: next,
    });
  }

  function changeMode(nextMode) {
    if (nextMode === mode || pending) return;
    leaveDraft(() => {
      if (dirty) setDraft(copyTemplate(saved));
      setNotice(null);
      setSelected(undefined);
      setMode(nextMode);
    });
  }

  function selectTemplate(id) {
    const template = plans.templates.find((candidate) => candidate.id === id);
    if (!template || id === draft?.id) return;
    leaveDraft(() => {
      setDraft(copyTemplate(template));
      setNotice(null);
    });
  }

  function place(index) {
    if (selected === undefined) return;
    setDraft((current) => {
      const previous = current.slots[index];
      if (selected === null && previous === null) return current;
      const next = copyTemplate(current);
      next.slots[index] = previous === selected ? null : selected;
      return next;
    });
  }

  function clearDraft() {
    if (pending) return;
    openDialog({
      title: fr.clearAllTitle,
      descriptions: [fr.clearAllDescription],
      action: fr.clearAll,
      danger: true,
      confirm: () => {
        setDraft((current) => ({ ...current, slots: emptySlots() }));
        setNotice(null);
      },
    });
  }

  async function store(operation, onSuccess, message) {
    if (pending) return;
    setPending(true);
    setNotice(null);
    try {
      onSuccess(await operation());
      setNotice({ message });
    } catch (error) {
      const conflict = error?.code === 'PT409' || error?.code === '23505';
      setNotice({ message: conflict ? fr.templateConflict : shared ? fr.connectionError : fr.storageError, error: true });
    } finally {
      setPending(false);
    }
  }

  function saveModel(model, message) {
    void store(() => repository.saveTemplate(model), (savedModel) => {
      setPlans((current) => {
        const exists = current.templates.some(({ id }) => id === savedModel.id);
        const templates = exists
          ? current.templates.map((item) => item.id === savedModel.id ? savedModel : item)
          : [...current.templates, savedModel];
        return { ...current, templates };
      });
      setDraft(copyTemplate(savedModel));
    }, message);
  }

  function addTemplate(name, source) {
    const template = {
      id: window.crypto.randomUUID(),
      name,
      slots: source ? [...source.slots] : emptySlots(),
      example: source?.example ?? false,
    };
    saveModel(template, source ? fr.duplicated : fr.created);
  }

  function templateAction(action) {
    if (pending) return;
    switch (action) {
      case 'create':
        openDialog({
          title: fr.createTitle, action: fr.create, initialName: '',
          descriptions: dirty ? [fr.createDescription, fr.discardDescription] : [fr.createDescription],
          confirm: (name) => addTemplate(name),
        });
        break;
      case 'rename':
        openDialog({
          title: fr.renameTitle, action: fr.rename, initialName: draft.name,
          confirm: (name) => {
            setDraft({ ...draft, name });
            setNotice(null);
          },
        });
        break;
      case 'duplicate':
        openDialog({
          title: fr.copyTitle, action: fr.duplicate,
          initialName: fr.copyName(draft.name).slice(0, MAX_NAME_LENGTH),
          descriptions: dirty ? [fr.copyDraft] : [],
          confirm: (name) => addTemplate(name, draft),
        });
        break;
      case 'delete':
        openDialog({
          title: fr.deleteTitle, action: fr.delete, danger: true,
          descriptions: dirty ? [fr.deleteDescription(saved.name), fr.deleteDraft] : [fr.deleteDescription(saved.name)],
          confirm: () => store(() => repository.deleteTemplate(draft), () => {
            const templates = plans.templates.filter(({ id }) => id !== draft.id);
            setPlans((current) => ({ ...current, templates }));
            setDraft(templates.length ? copyTemplate(templates[0]) : null);
          }, fr.deleted),
        });
        break;
      case 'reset':
        if (dirty) leaveDraft(() => {
          setDraft(copyTemplate(saved));
          setNotice(null);
        });
        break;
      case 'save':
        saveModel(draft, fr.saved);
        break;
      case 'apply':
        void store(() => repository.applyTemplate(draft),
          (published) => setPlans((current) => withPublished(current, published)),
          dirty ? fr.appliedWithDraft : fr.applied);
        break;
    }
  }

  return (
    <>
      <AppHeader signIn={signIn} signOut={signOut && (() => leaveDraft(signOut))} pending={pending}>
        {canEdit && (
          <div className="mode-switch" role="group" aria-label={fr.modes}>
            <button type="button" aria-pressed={!editing} onClick={() => changeMode('view')} disabled={pending}>
              <Eye aria-hidden="true" /><span className="view-label">{fr.view}</span><span className="view-short">{fr.viewShort}</span>
            </button>
            <button type="button" aria-pressed={editing} onClick={() => changeMode('edit')} disabled={!plans || pending}>
              <Pencil aria-hidden="true" />{fr.edit}
            </button>
          </div>
        )}
      </AppHeader>
      <main className="page-width main" id="main-content" tabIndex={-1}>
        <SectionBreadcrumb title={fr.brand} />
        <header className="page-heading">
          <h1>{editing ? fr.editTitle : fr.viewTitle}</h1>
        </header>
        {editing && plans && (
          <fieldset className="editor-controls" disabled={pending} aria-label={fr.template}>
            <TemplateBar templates={plans.templates} draft={draft} dirty={dirty} onSelect={selectTemplate}
              onAction={templateAction} />
          </fieldset>
        )}
        <div role="status" className="notices">
          {notice && <p className={notice.error ? 'notice error' : 'notice'}>{notice.message}</p>}
          {signOutError && <p className="notice error">{fr.connectionError}</p>}
          {shared && plans && (!connected || refreshFailed) && <p className="notice">{fr.refreshing}</p>}
          {pending && <p className="notice">{fr.saving}</p>}
        </div>
        {!plans && !notice && <p role="status">{fr.loading}</p>}
        {!plans && notice && (
          <button className="button" onClick={() => {
            setNotice(null);
            setAttempt(attempt + 1);
          }}>{fr.retry}</button>
        )}
        {!editing && plans && (plans.published ? (
          <div className="workspace">
            <div className="stand-column">
              <Stand {...plans.published} />
              <section className="card restock-guide" aria-labelledby="restock-title">
                <h2 id="restock-title">{fr.restockTitle}</h2>
                <ol>
                  {fr.restockSteps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              </section>
            </div>
            <Legend slots={plans.published.slots} />
          </div>
        ) : (
          <p className="card">{fr.noPublished}</p>
        ))}
        {editing && plans && (draft ? (
          <fieldset className="workspace with-picker editor-controls" disabled={pending} aria-label={fr.editTitle}>
            <HerbPicker slots={draft.slots} selected={selected} onSelect={setSelected} onClearAll={clearDraft} />
            <Stand {...draft} onPlace={place} />
            <Legend slots={draft.slots} />
          </fieldset>
        ) : (
          <section className="card empty-state">
            <h2>{fr.noTemplate}</h2>
            <p className="secondary">{fr.noTemplateDescription}</p>
          </section>
        ))}
      </main>
      {dialog && blocker.state !== 'blocked' && (
        <PlanDialog key="workspace-dialog" {...dialog} maxNameLength={MAX_NAME_LENGTH} onClose={() => setDialog(null)} onConfirm={(name) => {
          setDialog(null);
          dialog.confirm(name);
        }} />
      )}
      {blocker.state === 'blocked' && (pending || dirty) && (
        <PlanDialog key="navigation-dialog"
          title={pending ? fr.navigationPendingTitle : fr.discardTitle}
          descriptions={[pending ? fr.navigationPendingDescription : fr.discardDescription]}
          action={pending ? undefined : fr.discard}
          danger={!pending}
          onClose={() => blocker.reset()}
          onConfirm={() => blocker.proceed()} />
      )}
    </>
  );
}
