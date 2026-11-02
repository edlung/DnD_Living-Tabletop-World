import type { NewAccount } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useId, useRef, useState, type ReactNode, type SubmitEvent } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import type { SignInAnswer } from './account-flow.ts';

/**
 * The forms of accounts (docs/adr/0041-accounts.md, Stage 600): signing in with a login and a
 * password, a new account's fields (on the join page and when saving a seat), and a reset link's
 * new password. A password lives in its field only until it is sent. The forms check themselves
 * and say what is missing beside the field (never the browser's own bubble), focusing the first.
 */
const LOGIN = /^[a-z0-9._-]{3,32}$/;
const MIN_PASSWORD = 10;
const MAX_PASSWORD = 200;

/** What an input takes from its field: its id, what describes it, whether it is invalid. */
export interface ControlProps {
  readonly id: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: true;
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | null;
  readonly children: (control: ControlProps) => ReactNode;
}) {
  const id = useId();
  // An error says what the hint would: the hint steps aside while it shows.
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ');
  const control: ControlProps = {
    id,
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    ...(error ? { 'aria-invalid': true as const } : {}),
  };
  return (
    <div className="account-field">
      <label htmlFor={id}>{label}</label>
      {children(control)}
      {error && (
        <p id={errorId} className="account-field-error">
          {error}
        </p>
      )}
      {hintId && (
        <p id={hintId} className="fine-print">
          {hint}
        </p>
      )}
    </div>
  );
}

/** After a refused submit, focus goes to the first field that says what is wrong. */
export function useFocusFirstInvalid(attempt: number) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (attempt > 0) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempt]);
  return form;
}

/** Signing in with a login and a password; every refusal reads the same. */
export function AccountSignInForm({
  onSignIn,
  submitLabel,
}: {
  readonly onSignIn: (login: string, password: string) => Promise<SignInAnswer>;
  readonly submitLabel?: string;
}) {
  const t = useT();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<SignInAnswer | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [checked, setChecked] = useState(false);
  const form = useFocusFirstInvalid(attempt);
  const missingLogin = checked && login.trim() === '';
  const missingPassword = checked && password === '';
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (login.trim() === '' || password === '') {
      setChecked(true);
      setAttempt((value) => value + 1);
      return;
    }
    setBusy(true);
    setAnswer(null);
    const result = await onSignIn(login.trim(), password);
    setPassword('');
    setChecked(false);
    setBusy(false);
    setAnswer(result);
  }
  return (
    <form ref={form} className="account-form" noValidate onSubmit={(event) => void submit(event)}>
      <Field label={t('Login')} error={missingLogin ? t('Enter your login.') : null}>
        {(control) => (
          <input
            {...control}
            value={login}
            onChange={(event) => {
              setLogin(event.target.value);
            }}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
        )}
      </Field>
      <Field label={t('Password')} error={missingPassword ? t('Enter your password.') : null}>
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
      {answer !== null && answer !== 'signed-in' && (
        <p className="account-error" role="alert">
          {answer === 'limited'
            ? t('Too many tries. Wait a few minutes, then try again.')
            : answer === 'unreachable'
              ? t('The table could not be reached. Check your connection, then try again.')
              : t('That login and password do not match.')}
        </p>
      )}
      <div className="action-row">
        <button className="primary-button" type="submit" aria-disabled={busy || undefined}>
          <Glyph name="sign-in" />
          {busy ? t('Signing in…') : (submitLabel ?? t('Sign in'))}
        </button>
      </div>
    </form>
  );
}

export interface NewAccountDraft {
  readonly displayName: string;
  readonly login: string;
  readonly password: string;
}

export const EMPTY_ACCOUNT: NewAccountDraft = { displayName: '', login: '', password: '' };

export type DraftProblem = 'displayName' | 'login' | 'password';

/** What a new account's draft still lacks, as the server would refuse it. */
export function draftProblems(draft: NewAccountDraft): ReadonlySet<DraftProblem> {
  const problems = new Set<DraftProblem>();
  const name = draft.displayName.trim();
  if (name === '' || name.length > 60) problems.add('displayName');
  if (!LOGIN.test(draft.login.trim().toLowerCase())) problems.add('login');
  if (draft.password.length < MIN_PASSWORD || draft.password.length > MAX_PASSWORD) {
    problems.add('password');
  }
  return problems;
}

/** A complete draft as the server takes it; null while anything is missing. */
export function accountOf(draft: NewAccountDraft): NewAccount | null {
  if (draftProblems(draft).size > 0) return null;
  return {
    displayName: draft.displayName.trim(),
    login: draft.login.trim().toLowerCase(),
    password: draft.password,
  };
}

/** A new account's three fields; the login is how the person comes back from any device. */
export function NewAccountFields({
  draft,
  onChange,
  problems,
  loginTaken = false,
}: {
  readonly draft: NewAccountDraft;
  readonly onChange: (draft: NewAccountDraft) => void;
  /** What to point out: shown after a submit the draft could not pass. */
  readonly problems: ReadonlySet<DraftProblem>;
  readonly loginTaken?: boolean;
}) {
  const t = useT();
  return (
    <>
      <Field
        label={t('Your name at the table')}
        error={problems.has('displayName') ? t('Enter the name the table will see.') : null}
      >
        {(control) => (
          <input
            {...control}
            value={draft.displayName}
            onChange={(event) => {
              onChange({ ...draft, displayName: event.target.value });
            }}
            maxLength={60}
            autoComplete="nickname"
          />
        )}
      </Field>
      <Field
        label={t('Login')}
        hint={t('3–32 Latin letters, digits, dots, dashes or underscores.')}
        error={
          loginTaken
            ? t('That login is taken. Choose another one.')
            : problems.has('login')
              ? t('Use 3–32 Latin letters, digits, dots, dashes or underscores.')
              : null
        }
      >
        {(control) => (
          <input
            {...control}
            value={draft.login}
            onChange={(event) => {
              onChange({ ...draft, login: event.target.value });
            }}
            maxLength={32}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
        )}
      </Field>
      <Field
        label={t('Password')}
        hint={t('At least 10 characters. A short phrase is easy to remember.')}
        error={problems.has('password') ? t('Use at least 10 characters.') : null}
      >
        {(control) => (
          <input
            {...control}
            type="password"
            value={draft.password}
            onChange={(event) => {
              onChange({ ...draft, password: event.target.value });
            }}
            maxLength={MAX_PASSWORD}
            autoComplete="new-password"
          />
        )}
      </Field>
    </>
  );
}

/** A reset link's new password. */
export function ResetForm({
  onReset,
}: {
  readonly onReset: (password: string) => Promise<'done' | 'failed'>;
}) {
  const t = useT();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tooShort, setTooShort] = useState(false);
  const form = useFocusFirstInvalid(attempt);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || failed) return;
    if (password.length < MIN_PASSWORD) {
      setTooShort(true);
      setAttempt((value) => value + 1);
      return;
    }
    setTooShort(false);
    setBusy(true);
    const answer = await onReset(password);
    setPassword('');
    setBusy(false);
    setFailed(answer === 'failed');
  }
  return (
    <form ref={form} className="account-form" noValidate onSubmit={(event) => void submit(event)}>
      <Field
        label={t('New password')}
        hint={t('At least 10 characters. A short phrase is easy to remember.')}
        error={tooShort ? t('Use at least 10 characters.') : null}
      >
        {(control) => (
          <input
            {...control}
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            maxLength={MAX_PASSWORD}
            autoComplete="new-password"
          />
        )}
      </Field>
      {failed && (
        <p className="account-error" role="alert">
          {t('This reset link cannot be used. Ask your DM for a new one.')}
        </p>
      )}
      <div className="action-row">
        <button
          className="primary-button"
          type="submit"
          aria-disabled={busy || failed || undefined}
        >
          <Glyph name="key" />
          {busy ? t('Saving…') : t('Set the new password')}
        </button>
      </div>
    </form>
  );
}
