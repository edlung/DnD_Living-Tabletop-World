import { useT } from '@ltw/ui';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { deleteAccount } from './account-flow.ts';
import { Field } from './account-forms.tsx';

/**
 * A person's data on the account's page (docs/adr/0062-account-privacy.md): the privacy notice, a
 * copy of one's data to save, and deleting the account. Deleting is asked in a modal dialog that
 * opens on "Keep my account", with the password and the login typed again; it says what goes and
 * what stays, then that it is done. A DM's account is the operator's to delete.
 */
export function AccountData({
  transport,
  login,
  onDeleted,
}: {
  readonly transport: typeof fetch;
  readonly login: string;
  /** After the account is gone: the page signs out. */
  readonly onDeleted: () => void;
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  return (
    <section className="hub-section" aria-labelledby="hub-data">
      <h3 id="hub-data">{t('Your data')}</h3>
      <p className="muted">
        {t('What the game keeps about you, why, and for how long:')}{' '}
        <a className="text-link" href="/privacy">
          {t('the privacy notice')}
        </a>
      </p>
      <div className="action-row">
        <a className="button-link" href="/api/account/data" download>
          <Glyph name="journal" />
          {t('Download my data')}
        </a>
        <button
          type="button"
          onClick={() => {
            setAsking(true);
          }}
        >
          <Glyph name="discard" />
          {t('Delete my account')}
        </button>
      </div>
      <DeleteAccountDialog
        open={asking}
        login={login}
        transport={transport}
        onCancel={() => {
          setAsking(false);
        }}
        onDeleted={onDeleted}
      />
    </section>
  );
}

type Stage = 'asking' | 'deleting' | 'deleted';

function DeleteAccountDialog({
  open,
  login,
  transport,
  onCancel,
  onDeleted,
}: {
  readonly open: boolean;
  readonly login: string;
  readonly transport: typeof fetch;
  readonly onCancel: () => void;
  readonly onDeleted: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const [stage, setStage] = useState<Stage>('asking');
  const [typedLogin, setTypedLogin] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setStage('asking');
      setProblem(null);
      setTypedLogin('');
      setPassword('');
      dialog.showModal();
      // The final choice is never the one a second key press makes.
      keep.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (typedLogin.trim().toLowerCase() !== login || password === '') {
      setProblem(t('Type your login as it is, and your password.'));
      return;
    }
    setStage('deleting');
    setProblem(null);
    const answer = await deleteAccount(transport, typedLogin.trim(), password);
    setPassword('');
    if (answer.kind === 'done') {
      setStage('deleted');
      return;
    }
    setStage('asking');
    setProblem(
      answer.kind === 'refused' && answer.reason === 'dm-seat'
        ? t('You are the DM of a campaign: the server’s operator deletes a DM’s account.')
        : answer.kind === 'refused' && answer.status === 403
          ? t('The login or the password is not right.')
          : t('The table could not be reached. Check your connection, then try again.'),
    );
  }
  const busy = stage === 'deleting';
  return (
    <dialog
      ref={ref}
      className="sign-out-dialog account-delete-dialog"
      aria-labelledby="account-delete-title"
      aria-describedby="account-delete-text"
      onCancel={(event) => {
        // Escape: React decides when the dialog closes, and never while deleting.
        event.preventDefault();
        if (stage === 'asking') onCancel();
      }}
      onClose={() => {
        if (open && stage === 'asking') onCancel();
      }}
    >
      {stage === 'deleted' ? (
        <>
          <h2 id="account-delete-title">
            <Glyph name="discard" />
            {t('Your account is deleted')}
          </h2>
          <p id="account-delete-text" role="status">
            {t('Its login, its name and its password are gone, and every device is signed out.')}
          </p>
          <div className="action-row">
            <button className="primary-button" autoFocus onClick={onDeleted}>
              {t('Close')}
            </button>
          </div>
        </>
      ) : (
        <form noValidate onSubmit={(event) => void submit(event)}>
          <h2 id="account-delete-title">
            <Glyph name="discard" />
            {t('Delete your account?')}
          </h2>
          <p id="account-delete-text">
            {t(
              'Your login, your name and your password are forgotten and every device signs out. Your characters stay in their campaigns’ story, and their DMs see their seats empty. This cannot be undone.',
            )}
          </p>
          <Field label={t('Your login')}>
            {(control) => (
              <input
                {...control}
                value={typedLogin}
                onChange={(event) => {
                  setTypedLogin(event.target.value);
                }}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
            )}
          </Field>
          <Field label={t('Your password')}>
            {(control) => (
              <input
                {...control}
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                autoComplete="current-password"
              />
            )}
          </Field>
          {problem && (
            <p role="alert" className="sign-out-failed">
              {problem}
            </p>
          )}
          <div className="action-row">
            <button type="submit" className="danger-button" disabled={busy}>
              <Glyph name="discard" />
              {busy ? t('Deleting…') : t('Delete my account')}
            </button>
            <button ref={keep} type="button" disabled={busy} onClick={onCancel}>
              {t('Keep my account')}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
