import { SESSION_DAYS, type NewAccount } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useId, useState, type SubmitEvent } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import type { SignInAnswer } from './account-flow.ts';
import {
  EMPTY_ACCOUNT,
  Field,
  NewAccountFields,
  accountOf,
  draftProblems,
  useFocusFirstInvalid,
  type DraftProblem,
  type NewAccountDraft,
} from './account-forms.tsx';

/**
 * How the person comes back to the table they are invited to (docs/adr/0041-accounts.md §4,
 * Stage 600): a new login (the default), a login they have — signed in first, then the seat joins
 * its campaigns — or only this browser, as before accounts. Nothing is sent before "Take your seat",
 * and a refusal that keeps the invitation unspent (a taken login, a seat the login already has)
 * comes back here with the draft kept, its password emptied.
 */
export type JoinMode = 'new' | 'existing' | 'browser';

export interface JoinDraft {
  readonly mode: JoinMode;
  readonly account: NewAccountDraft;
  /** The login of the "I have a login" choice; its password is never kept. */
  readonly login: string;
}

export const EMPTY_JOIN: JoinDraft = { mode: 'new', account: EMPTY_ACCOUNT, login: '' };

const MODES: readonly JoinMode[] = ['new', 'existing', 'browser'];
const NO_PROBLEMS: ReadonlySet<DraftProblem> = new Set();

export function JoinPanel({
  draft,
  onDraft,
  problem,
  onTakeSeat,
  onSignInAccount,
  onHub,
}: {
  readonly draft: JoinDraft;
  readonly onDraft: (draft: JoinDraft) => void;
  /** Why the last try came back, the invitation unspent. */
  readonly problem: 'login-taken' | 'already-seated' | undefined;
  readonly onTakeSeat: (newAccount: NewAccount | null) => void;
  readonly onSignInAccount: (login: string, password: string) => Promise<SignInAnswer>;
  readonly onHub: () => void;
}) {
  const t = useT();
  const id = useId();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<SignInAnswer | null>(null);
  const [problems, setProblems] = useState<ReadonlySet<DraftProblem>>(NO_PROBLEMS);
  const [missing, setMissing] = useState(false);
  const [attempt, setAttempt] = useState(problem === 'login-taken' ? 1 : 0);
  const form = useFocusFirstInvalid(attempt);
  // The login the server found taken, until the person writes another one.
  const [takenLogin] = useState(problem === 'login-taken' ? draft.account.login : null);
  const loginTaken = draft.mode === 'new' && draft.account.login === takenLogin;
  // A new try starts clean: what the last one pointed out is answered by the next submit.
  useEffect(() => {
    setAnswer(null);
    setMissing(false);
  }, [draft.mode]);

  const words: Record<JoinMode, { readonly title: string; readonly hint: string }> = {
    new: {
      title: t('Create a login'),
      hint: t('Come back from any device with your login and password.'),
    },
    existing: {
      title: t('I have a login'),
      hint: t('This table joins the campaigns of your login.'),
    },
    browser: {
      title: t('Only this browser'),
      hint: t('No login: you come back only in this browser, for up to {days} days.', {
        days: SESSION_DAYS,
      }),
    },
  };

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (draft.mode === 'browser') {
      onTakeSeat(null);
      return;
    }
    if (draft.mode === 'new') {
      const account = accountOf(draft.account);
      setProblems(draftProblems(draft.account));
      if (account === null) {
        setAttempt((value) => value + 1);
        return;
      }
      onDraft({ ...draft, account: { ...draft.account, password: '' } });
      onTakeSeat(account);
      return;
    }
    if (draft.login.trim() === '' || password === '') {
      setMissing(true);
      setAttempt((value) => value + 1);
      return;
    }
    setMissing(false);
    setBusy(true);
    setAnswer(null);
    const signedIn = await onSignInAccount(draft.login.trim(), password);
    setPassword('');
    setBusy(false);
    // Signed in: the seat is taken for that login (the invitation is sent now, once).
    if (signedIn === 'signed-in') onTakeSeat(null);
    else setAnswer(signedIn);
  }

  return (
    <form ref={form} className="join-panel" noValidate onSubmit={(event) => void submit(event)}>
      {problem === 'already-seated' && (
        <div className="account-error" role="alert">
          <p>{t('Your login already has a seat at this table. Open it from your campaigns.')}</p>
          <button type="button" onClick={onHub}>
            <Glyph name="party" />
            {t('My campaigns')}
          </button>
        </div>
      )}
      <fieldset className="join-modes">
        <legend>{t('How will you come back to this table?')}</legend>
        {MODES.map((mode) => (
          <div className="join-mode" key={mode}>
            <input
              type="radio"
              id={`${id}-${mode}`}
              name={`${id}-mode`}
              value={mode}
              checked={draft.mode === mode}
              aria-describedby={`${id}-${mode}-hint`}
              onChange={() => {
                setProblems(NO_PROBLEMS);
                onDraft({ ...draft, mode });
              }}
            />
            <label htmlFor={`${id}-${mode}`}>{words[mode].title}</label>
            <p id={`${id}-${mode}-hint`} className="fine-print">
              {words[mode].hint}
            </p>
          </div>
        ))}
      </fieldset>
      {draft.mode === 'new' && (
        <div className="account-form">
          <NewAccountFields
            draft={draft.account}
            onChange={(account) => {
              onDraft({ ...draft, account });
            }}
            problems={problems}
            loginTaken={loginTaken}
          />
        </div>
      )}
      {draft.mode === 'existing' && (
        <div className="account-form">
          <Field
            label={t('Login')}
            error={missing && draft.login.trim() === '' ? t('Enter your login.') : null}
          >
            {(control) => (
              <input
                {...control}
                value={draft.login}
                onChange={(event) => {
                  onDraft({ ...draft, login: event.target.value });
                }}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
            )}
          </Field>
          <Field
            label={t('Password')}
            error={missing && password === '' ? t('Enter your password.') : null}
          >
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
        </div>
      )}
      <div className="action-row">
        <button className="primary-button" type="submit" aria-disabled={busy || undefined}>
          <Glyph name="sign-in" />
          {busy ? t('Signing in…') : t('Take your seat')}
        </button>
      </div>
    </form>
  );
}
