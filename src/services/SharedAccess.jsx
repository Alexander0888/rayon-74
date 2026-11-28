import { useEffect, useRef, useState } from 'react';
import { fr } from '../content/fr.js';

export function AccessScreen({ children }) {
  return (
    <main className="page-width main">
      <header className="page-heading"><h1>{fr.brand}</h1><p className="secondary">{fr.department}</p></header>
      <section className="card access-card">{children}</section>
    </main>
  );
}

function SignIn({ client, membership, onSuccess, onClose }) {
  const dialog = useRef(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  async function submit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setError('');
    try {
      const { data, error: failure } = await client.auth.signInWithPassword({
        email: form.get('email').trim(),
        password: form.get('password'),
      });
      if (failure) {
        setError(failure.code === 'invalid_credentials' ? fr.invalidCredentials : fr.connectionError);
      } else {
        formElement.reset();
        onSuccess(data.user.id);
      }
    } catch {
      setError(fr.connectionError);
    } finally {
      setPending(false);
    }
  }

  const message = error || (membership?.error ? fr.connectionError : membership ? fr.noManagerAccess : '');

  return (
    <dialog ref={dialog} aria-labelledby="sign-in-title"
      onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}>
      <h2 id="sign-in-title">{fr.managerSignIn}</h2>
      <form className="access-form" onSubmit={submit}>
        <label>{fr.email}<input name="email" type="email" autoComplete="username" autoFocus required /></label>
        <label>{fr.password}<input name="password" type="password" autoComplete="current-password" required /></label>
        {message && <p className="notice error" role="alert">{message}</p>}
        <div className="dialog-actions">
          <button className="button" type="button" onClick={onClose} disabled={pending}>{fr.cancel}</button>
          <button className="button primary" type="submit" disabled={pending}>{fr.signIn}</button>
        </div>
      </form>
    </dialog>
  );
}

export function SharedAccess({ client, children }) {
  const [userId, setUserId] = useState(undefined);
  const [membership, setMembership] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [loginOpen, setLoginOpen] = useState(false);
  const [signOutError, setSignOutError] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, [client]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    async function loadMembership() {
      try {
        const { data, error } = await client.from('rayon_members').select('role').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        if (!cancelled) setMembership({ userId, attempt, role: data?.role ?? null });
      } catch {
        if (!cancelled) setMembership({ userId, attempt, error: true });
      }
    }
    void loadMembership();
    return () => { cancelled = true; };
  }, [attempt, client, userId]);

  const currentMembership = userId && membership?.userId === userId && membership.attempt === attempt
    ? membership : null;
  const canEdit = currentMembership?.role === 'manager';
  const canPublishVisit = canEdit || currentMembership?.role === 'admin';

  useEffect(() => {
    if (canPublishVisit) setLoginOpen(false);
  }, [canPublishVisit]);

  async function signOut() {
    setSignOutError(false);
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setMembership(null);
      setUserId(null);
    } catch {
      setSignOutError(true);
    }
  }

  return (
    <>
      {children({
        workspaceKey: canPublishVisit ? userId : 'public',
        canEdit, canPublishVisit,
        isDemo: userId === null,
        accessPending: userId === undefined || Boolean(userId && !currentMembership),
        startEditing: canEdit && loginOpen,
        signIn: canPublishVisit ? undefined : () => setLoginOpen(true),
        signOut: canPublishVisit ? signOut : undefined,
        signOutError,
      })}
      {loginOpen && !canPublishVisit && (
        <SignIn client={client} membership={currentMembership} onClose={() => setLoginOpen(false)} onSuccess={(id) => {
          setUserId(id);
          setAttempt((value) => value + 1);
        }} />
      )}
    </>
  );
}
