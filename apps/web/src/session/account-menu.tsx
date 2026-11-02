import type { AccountResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SubmitEvent,
} from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { IconButton } from '../visual/icon-button.tsx';
import { claimSeat, readAccount } from './account-flow.ts';
import {
  EMPTY_ACCOUNT,
  NewAccountFields,
  accountOf,
  draftProblems,
  useFocusFirstInvalid,
  type DraftProblem,
  type NewAccountDraft,
} from './account-forms.tsx';

/**
 * The account beside a world (docs/adr/0041-accounts.md, Stage 600): a signed-in browser's top bar
 * offers "My campaigns" when it is signed in to a login, and "Save my seat" — a new login for the
 * seat it holds — when it is not. Read once per session screen; nothing here opens a campaign.
 */
export interface SessionAccount {
  /** `unknown` while read or unanswered; `none`: no login in this browser. */
  readonly account: AccountResponse | 'none' | 'unknown';
  readonly refresh: () => void;
  readonly toHub: () => void;
}

const SessionAccountContext = createContext<SessionAccount | null>(null);

export const useSessionAccount = () => useContext(SessionAccountContext);

/** Reads the account for a production session's screen (remounted with each session). */
export function SessionAccountProvider({
  enabled,
  onHub,
  transport = fetch,
  children,
}: {
  readonly enabled: boolean;
  readonly onHub: () => void;
  readonly transport?: typeof fetch;
  readonly children: ReactNode;
}) {
  const [account, setAccount] = useState<SessionAccount['account']>('unknown');
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void readAccount(transport, controller.signal).then((reading) => {
      if (controller.signal.aborted) return;
      setAccount(
        reading.kind === 'account' ? reading.account : reading.kind === 'none' ? 'none' : 'unknown',
      );
    });
    return () => {
      controller.abort();
    };
  }, [enabled, round, transport]);
  const value: SessionAccount = {
    account: enabled ? account : 'unknown',
    refresh: () => {
      setRound((value) => value + 1);
    },
    toHub: onHub,
  };
  return <SessionAccountContext.Provider value={value}>{children}</SessionAccountContext.Provider>;
}

/** The top bar's account control: my campaigns, or saving this seat to a new login. */
export function AccountButton({ transport = fetch }: { readonly transport?: typeof fetch }) {
  const t = useT();
  const session = useSessionAccount();
  const [saving, setSaving] = useState(false);
  if (session === null || session.account === 'unknown') return null;
  if (session.account !== 'none') {
    return <IconButton glyph="party" label={t('My campaigns')} labelled onClick={session.toHub} />;
  }
  return (
    <>
      <IconButton
        glyph="key"
        label={t('Save my seat')}
        labelled
        aria-haspopup="dialog"
        onClick={() => {
          setSaving(true);
        }}
      />
      <ClaimDialog
        open={saving}
        transport={transport}
        onClose={() => {
          setSaving(false);
        }}
        onSaved={() => {
          setSaving(false);
          session.refresh();
        }}
      />
    </>
  );
}

const NO_PROBLEMS: ReadonlySet<DraftProblem> = new Set();

/** A new login for the seat this browser holds: the seat then opens from any device. */
function ClaimDialog({
  open,
  transport,
  onClose,
  onSaved,
}: {
  readonly open: boolean;
  readonly transport: typeof fetch;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<NewAccountDraft>(EMPTY_ACCOUNT);
  const [problems, setProblems] = useState<ReadonlySet<DraftProblem>>(NO_PROBLEMS);
  const [refusal, setRefusal] = useState<'login-taken' | 'has-account' | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const form = useFocusFirstInvalid(attempt);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setRefusal(null);
      setProblems(NO_PROBLEMS);
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>('input')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const account = accountOf(draft);
    setProblems(draftProblems(draft));
    if (account === null) {
      setAttempt((value) => value + 1);
      return;
    }
    setBusy(true);
    setRefusal(null);
    const answer = await claimSeat(transport, account);
    setBusy(false);
    setDraft((shown) => ({ ...shown, password: '' }));
    if (answer.kind === 'done') {
      setDraft(EMPTY_ACCOUNT);
      onSaved();
      return;
    }
    setRefusal(
      answer.kind === 'refused' && answer.reason === 'login-taken'
        ? 'login-taken'
        : answer.kind === 'refused' && answer.reason === 'has-account'
          ? 'has-account'
          : 'failed',
    );
    setAttempt((value) => value + 1);
  }
  return (
    <dialog
      ref={ref}
      className="sign-out-dialog account-dialog"
      aria-labelledby="claim-title"
      aria-describedby="claim-text"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <h2 id="claim-title">
        <Glyph name="key" />
        {t('Save your seat to a login')}
      </h2>
      <p id="claim-text">
        {t(
          'With a login you come back to this table from any device, and find all your campaigns in one place.',
        )}
      </p>
      <form ref={form} className="account-form" noValidate onSubmit={(event) => void submit(event)}>
        <NewAccountFields
          draft={draft}
          onChange={(next) => {
            setDraft(next);
            if (refusal === 'login-taken') setRefusal(null);
          }}
          problems={problems}
          loginTaken={refusal === 'login-taken'}
        />
        {(refusal === 'has-account' || refusal === 'failed') && (
          <p className="account-error" role="alert">
            {refusal === 'has-account'
              ? t('This seat is saved to a login already.')
              : t('The seat could not be saved. Check your connection, then try again.')}
          </p>
        )}
        <div className="action-row">
          <button className="primary-button" type="submit" aria-disabled={busy || undefined}>
            <Glyph name="key" />
            {busy ? t('Saving…') : t('Save my seat')}
          </button>
          <button type="button" disabled={busy} onClick={onClose}>
            {t('Not now')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
