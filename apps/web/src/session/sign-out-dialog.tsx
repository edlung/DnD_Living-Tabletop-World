import { useT } from '@ltw/ui';
import { useEffect, useRef, useState } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import type { Connection, GameSignOutGuard } from '../api/client.ts';
import { signOut } from './sign-in-flow.ts';

/**
 * The question before signing out (docs/adr/0036-production-sign-in.md §3): signing out is
 * final here — coming back takes a new invitation link — so it is asked as a native modal
 * dialog that opens on "Stay signed in" (focus stays inside, Escape keeps the session, focus
 * returns where it was). The session ends only when the server says so; if it cannot be
 * reached the person is told they are still signed in.
 */
export function SignOutDialog({
  open,
  onCancel,
  onSignedOut,
  transport = fetch,
  connection,
}: {
  readonly open: boolean;
  readonly onCancel: () => void;
  readonly onSignedOut: () => void;
  readonly transport?: typeof fetch;
  readonly connection: Extract<Connection, { kind: 'session' }>;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const stay = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<'asking' | 'signing-out' | 'failed'>('asking');
  const request = useRef<AbortController | null>(null);
  const mounted = useRef<GameSignOutGuard>({ campaignId: connection.campaignId });
  const sending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    sending.current = false;
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      mounted.current = connection.signOutGuard?.() ?? { campaignId: connection.campaignId };
      setState('asking');
      dialog.showModal();
      // The final choice is never the one a second key press makes.
      stay.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
    return () => {
      controller.abort();
      if (request.current === controller) request.current = null;
    };
  }, [open, connection]);
  const busy = state === 'signing-out';
  const confirm = () => {
    const controller = request.current;
    if (!open || !controller || controller.signal.aborted || sending.current) return;
    sending.current = true;
    setState('signing-out');
    void signOut(transport, mounted.current, controller.signal).then((result) => {
      if (controller.signal.aborted || request.current !== controller) return;
      sending.current = false;
      if (result === 'signed-out') onSignedOut();
      else setState('failed');
    });
  };
  return (
    <dialog
      ref={ref}
      className="sign-out-dialog"
      aria-labelledby="sign-out-title"
      aria-describedby="sign-out-text"
      onCancel={(event) => {
        // Escape: React decides when the dialog closes, and never while signing out.
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClose={() => {
        if (open) onCancel();
      }}
    >
      <h2 id="sign-out-title">
        <Glyph name="leave" />
        {t('Sign out?')}
      </h2>
      <p id="sign-out-text">
        {t('You will need a new invitation link to come back to this table.')}
      </p>
      {state === 'failed' && (
        <p role="alert" className="sign-out-failed">
          {t('The table could not be reached, so you are still signed in. Try again.')}
        </p>
      )}
      <div className="action-row">
        <button className="primary-button" disabled={busy} onClick={confirm}>
          <Glyph name="leave" />
          {busy ? t('Signing out…') : t('Sign out')}
        </button>
        <button ref={stay} disabled={busy} onClick={onCancel}>
          {t('Stay signed in')}
        </button>
      </div>
    </dialog>
  );
}
