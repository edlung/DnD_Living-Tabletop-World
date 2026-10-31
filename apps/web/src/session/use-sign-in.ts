import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { Connection } from '../api/client.ts';
import type { InvitationHolder } from './invitation-link.ts';
import {
  describeSignIn,
  probeSession,
  replaceSignIn,
  takeSeat,
  type CurrentSignIn,
  type PageStart,
  type SeatOutcome,
  type SessionProbe,
} from './sign-in-flow.ts';
import { SignInWatch, watchReturns } from './sign-in-watch.ts';
import { MountedGameIdentity } from './mounted-game.ts';

/**
 * What the page shows before and around a world (docs/adr/0036-production-sign-in.md §7;
 * docs/STAGE_340_DESIGN.md "Browser", "Part B review fixes"): finding out whether this browser is
 * signed in, the development personas' form, an invitation waiting for the person to take their
 * seat, joining (and, for a browser signed in already, the question whether to replace that
 * sign-in), the fixed failure of an invitation, signed out, or a world. No screen holds a token.
 */
export type SignInScreen =
  | { readonly kind: 'checking' }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'personas' }
  | { readonly kind: 'invited' }
  | { readonly kind: 'joining' }
  | {
      readonly kind: 'confirm';
      /** Who this browser is signed in as: undefined while it is read, null if unknown. */
      readonly current: CurrentSignIn | null | undefined;
    }
  | { readonly kind: 'join-failed' }
  /** `none`: never signed in here; `ended`: the session ended under it; `left`: signed out. */
  | { readonly kind: 'signed-out'; readonly reason: 'none' | 'ended' | 'left' }
  | { readonly kind: 'session'; readonly connection: Connection; readonly key: number };

const firstScreen = (start: PageStart): SignInScreen =>
  start.kind === 'invited'
    ? { kind: 'invited' }
    : start.kind === 'malformed'
      ? { kind: 'join-failed' }
      : { kind: 'checking' };

/** A fresh start page in place of this one (this history entry is replaced). */
const startAfresh = () => {
  window.location.replace('/');
};

/**
 * The page's sign-in state. Every step is a generation: an answer to an older step never
 * replaces what a newer one shows, and only the session on screen can be signed out. An
 * invitation's token lives only in one-shot holders (`invitation-link.ts`), never in state or
 * props: the page's, spent by "Take your seat", and the question's, kept or spent by the
 * person's answer; leaving the page forgets both. Once the seat is taken, the current sign-in
 * kept, or the person goes back to the start after a failure, the join page gives way to a
 * fresh start page (`restart`), so nothing of it outlives the invitation — not its memory, nor
 * the navigation timing entry in which the browser keeps the address it opened with. A session
 * screen is watched (`SignInWatch`): a 401, or a doubt the server answers with another sign-in,
 * shows "You are signed out". Back/Forward restoration never shows a world again from memory:
 * with production sign-in the server is asked anew, with personas the form shows.
 */
export function useSignIn(
  start: PageStart,
  transport: typeof fetch = fetch,
  restart: () => void = startAfresh,
) {
  const [screen, setScreen] = useState<SignInScreen>(() => firstScreen(start));
  const [askingSignOut, setAskingSignOut] = useState(false);
  const step = useRef(0);
  const sessions = useRef(0);
  const active = useRef<Connection | null>(null);
  const watch = useRef<SignInWatch | null>(null);
  const mode = useRef<'unknown' | 'personas' | 'invitations'>('unknown');
  // The question's token: held only while the person is asked whether to replace a sign-in.
  const replacement = useRef<InvitationHolder | null>(null);

  /**
   * Starts a new generation: whatever an older step still answers is ignored, the shown session's
   * watch ends, and the question's token is forgotten (keeping the sign-in, a failure, leaving).
   */
  const next = useCallback((shown: SignInScreen) => {
    step.current += 1;
    active.current = null;
    watch.current?.close();
    watch.current = null;
    replacement.current?.forget();
    replacement.current = null;
    setAskingSignOut(false);
    setScreen(shown);
    return step.current;
  }, []);

  const enter = useCallback(
    (connection: Connection, watching: SignInWatch | null = null) => {
      next({ kind: 'session', connection, key: (sessions.current += 1) });
      active.current = connection;
      watch.current = watching;
    },
    [next],
  );

  /** A production session for a campaign, watched: a 401, or another sign-in, signs it out. */
  const enterSession = useCallback(
    (campaignId: string) => {
      const ended = () => {
        if (active.current === connection) next({ kind: 'signed-out', reason: 'ended' });
      };
      const watching = new SignInWatch({ transport, campaignId, onChanged: ended });
      const mounted = new MountedGameIdentity(campaignId);
      const connection: Connection = {
        kind: 'session',
        campaignId,
        onSignedOut: ended,
        onDoubt: () => {
          if (active.current === connection) watching.doubt();
        },
        onIdentity: (identity) => {
          if (active.current === connection) {
            mounted.observe(identity);
            watching.observe(identity);
          }
        },
        signOutGuard: () => mounted.read(),
      };
      enter(connection, watching);
    },
    [enter, next, transport],
  );

  const apply = useCallback(
    (outcome: SessionProbe | SeatOutcome, generation: number) => {
      if (generation !== step.current) {
        // A question nobody will be asked any more: its token goes.
        if (outcome.kind === 'needs-confirmation') outcome.replacement.forget();
        return;
      }
      if (outcome.kind === 'personas') mode.current = 'personas';
      else if (outcome.kind !== 'unreachable' && outcome.kind !== 'failed') {
        mode.current = 'invitations';
      }
      switch (outcome.kind) {
        case 'signed-in':
          enterSession(outcome.campaignId);
          return;
        case 'joined':
          // Seated (the cookie is set): the world opens on a fresh start page.
          restart();
          return;
        case 'signed-out':
          next({ kind: 'signed-out', reason: 'none' });
          return;
        case 'personas':
          next({ kind: 'personas' });
          return;
        case 'unreachable':
          next({ kind: 'unreachable' });
          return;
        case 'failed':
          next({ kind: 'join-failed' });
          return;
        case 'needs-confirmation':
          next({ kind: 'confirm', current: undefined });
          // Held for the question alone, outside React state.
          replacement.current = outcome.replacement;
          return;
      }
    },
    [enterSession, next, restart],
  );

  // Without an invitation the first request was sent once, when the page loaded: await it.
  useEffect(() => {
    if (start.kind !== 'probe') return;
    const generation = step.current;
    let waiting = true;
    void start.first.then((outcome) => {
      if (waiting) apply(outcome, generation);
    });
    return () => {
      waiting = false;
    };
  }, [start, apply]);

  /** Asks the server whether this browser is signed in (the form, for development personas). */
  const probe = useCallback(() => {
    if (mode.current === 'personas') {
      next({ kind: 'personas' });
      return;
    }
    const generation = next({ kind: 'checking' });
    void probeSession(transport).then((outcome) => {
      apply(outcome, generation);
    });
  }, [apply, next, transport]);

  // Naming the sign-in the invitation would replace: read once the question shows.
  const confirming = screen.kind === 'confirm' && screen.current === undefined;
  useEffect(() => {
    if (!confirming) return;
    const generation = step.current;
    const controller = new AbortController();
    void describeSignIn(transport, controller.signal).then((current) => {
      if (controller.signal.aborted || generation !== step.current) return;
      setScreen((shown) => (shown.kind === 'confirm' ? { ...shown, current } : shown));
    });
    return () => {
      controller.abort();
    };
  }, [confirming, transport]);

  // A signed-in tab asks again when the browser comes back online or the tab is shown again.
  const shownConnection = screen.kind === 'session' ? screen.connection : null;
  useEffect(() => {
    if (shownConnection?.kind !== 'session') return;
    return watchReturns(window, document, shownConnection.onDoubt);
  }, [shownConnection]);

  // Back/Forward restoration (bfcache) must never show a world from memory; leaving the page
  // forgets the invitation.
  useEffect(() => {
    const hide = () => {
      if (start.kind === 'invited') start.invitation.forget();
      // A history snapshot may precede React's native-event batch commit.
      flushSync(() => {
        next(mode.current === 'personas' ? { kind: 'personas' } : { kind: 'checking' });
      });
    };
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) probe();
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, [start, next, probe]);

  return {
    screen,
    /** The sign-out question is open over the world. */
    askingSignOut,
    /** Ask again, after no answer. */
    probe,
    /** After a failed invitation: a fresh start page, which asks whether this browser is signed in. */
    backToStart: () => {
      next({ kind: 'checking' });
      restart();
    },
    /** "Take your seat": the invitation is redeemed now, once. */
    takeSeat: () => {
      if (screen.kind !== 'invited' || start.kind !== 'invited') return;
      const { invitation } = start;
      if (!invitation.holds()) return;
      const generation = next({ kind: 'joining' });
      void takeSeat(invitation, transport).then((outcome) => {
        if (outcome !== null) apply(outcome, generation);
      });
    },
    /** The person keeps this browser's sign-in: the invitation is forgotten, unused. */
    keep: () => {
      if (screen.kind !== 'confirm') return;
      next({ kind: 'checking' });
      restart();
    },
    /** The person confirmed: the invitation replaces this browser's sign-in. */
    replace: () => {
      const held = replacement.current;
      if (screen.kind !== 'confirm' || held === null) return;
      replacement.current = null;
      const generation = next({ kind: 'joining' });
      void replaceSignIn(held, transport).then((outcome) => {
        if (outcome !== null) apply(outcome, generation);
      });
    },
    /** The development personas' form: a token typed in, kept in memory only. */
    connectPersona: (campaignId: string, token: string) => {
      mode.current = 'personas';
      enter({ kind: 'persona', campaignId, token });
    },
    /** A persona leaves at once; a signed-in session is asked first (signing out is final). */
    leave: () => {
      if (screen.kind !== 'session') return;
      if (screen.connection.kind === 'persona') next({ kind: 'personas' });
      else setAskingSignOut(true);
    },
    cancelSignOut: () => {
      setAskingSignOut(false);
    },
    /** The server ended this browser's session. */
    signedOut: () => {
      if (screen.kind === 'session' && active.current === screen.connection)
        next({ kind: 'signed-out', reason: 'left' });
    },
  };
}
