import type { AccountResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useState, type SubmitEvent } from 'react';

import { changePassword, renameAccount } from './account-flow.ts';
import { Field, useFocusFirstInvalid } from './account-forms.tsx';

/** The name the table sees, and the password (the current one first). */
export function AccountSettings({
  transport,
  account,
  onRenamed,
}: {
  readonly transport: typeof fetch;
  readonly account: AccountResponse;
  readonly onRenamed: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(account.displayName);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [nameMissing, setNameMissing] = useState(false);
  const [passwordProblem, setPasswordProblem] = useState<'current' | 'next' | null>(null);
  const [nameAttempt, setNameAttempt] = useState(0);
  const [passwordAttempt, setPasswordAttempt] = useState(0);
  const nameForm = useFocusFirstInvalid(nameAttempt);
  const passwordForm = useFocusFirstInvalid(passwordAttempt);
  async function rename(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameMissing(name.trim() === '');
    if (name.trim() === '') {
      setNameAttempt((value) => value + 1);
      return;
    }
    const answer = await renameAccount(transport, name.trim());
    setNote(answer.kind === 'done' ? t('Your name is saved.') : t('Your name could not be saved.'));
    if (answer.kind === 'done') onRenamed();
  }
  async function repass(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = current === '' ? 'current' : next.length < 10 ? 'next' : null;
    setPasswordProblem(problem);
    if (problem !== null) {
      setPasswordAttempt((value) => value + 1);
      return;
    }
    const answer = await changePassword(transport, current, next);
    setCurrent('');
    setNext('');
    setNote(
      answer.kind === 'done'
        ? t('Your password is changed. Other devices sign in again.')
        : answer.kind === 'refused' && answer.status === 403
          ? t('The current password is not right.')
          : t('Your password could not be changed.'),
    );
  }
  return (
    <section className="hub-section" aria-labelledby="hub-account">
      <h3 id="hub-account">{t('Your account')}</h3>
      <p className="muted">{t('Login: {login}', { login: account.login })}</p>
      <div className="hub-settings">
        <form
          ref={nameForm}
          className="account-form"
          noValidate
          onSubmit={(event) => void rename(event)}
        >
          <Field
            label={t('Your name at the table')}
            error={nameMissing ? t('Enter the name the table will see.') : null}
          >
            {(control) => (
              <input
                {...control}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                maxLength={60}
                autoComplete="nickname"
              />
            )}
          </Field>
          <button type="submit">{t('Save the name')}</button>
        </form>
        <form
          ref={passwordForm}
          className="account-form"
          noValidate
          onSubmit={(event) => void repass(event)}
        >
          <Field
            label={t('Current password')}
            error={passwordProblem === 'current' ? t('Enter your password.') : null}
          >
            {(control) => (
              <input
                {...control}
                type="password"
                value={current}
                onChange={(event) => {
                  setCurrent(event.target.value);
                }}
                autoComplete="current-password"
              />
            )}
          </Field>
          <Field
            label={t('New password')}
            hint={t('At least 10 characters. A short phrase is easy to remember.')}
            error={passwordProblem === 'next' ? t('Use at least 10 characters.') : null}
          >
            {(control) => (
              <input
                {...control}
                type="password"
                value={next}
                onChange={(event) => {
                  setNext(event.target.value);
                }}
                maxLength={200}
                autoComplete="new-password"
              />
            )}
          </Field>
          <button type="submit">{t('Change the password')}</button>
        </form>
      </div>
      {note && (
        <p className="fine-print" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
