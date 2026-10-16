import { useCallback, useEffect, useRef, useState } from 'react';

import type { Connection } from '../api/client.ts';
import {
  describeSignIn,
  probeSession,
  redeemInvitation,
  type CurrentSignIn,
  type FirstStep,
} from './sign-in-flow.ts';

/**
 * What the page shows before and around a world (docs/adr/0036-production-sign-in.md §7;
 * docs/STAGE_340_DESIGN.md "Browser"): finding out whether this browser is signed in, the
 * development personas' form, joining by invitation (and, for a browser signed in already,
 * the question whether to replace that sign-in), the fixed failure of an invitation, signed
 * out, or a world.
 */
export type SignInScreen =
  | { readonly kind: 'checking' }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'personas' }
  | { readonly kind: 'joining' }
  | {
      readonly kind: 'confirm';
      readonly token: string;
      /** Who this browser is signed in as: undefined while it is read, null if unknown. */
      readonly current: CurrentSignIn | null | undefined;
    }
  | { readonly kind: 'join-failed' }
  /** `none`: never signed in here; `ended`: the session ended under it; `left`: signed out. */
  | { readonly kind: 'signed-out'; readonly reason: 'none' | 'ended' | 'left' }
  | { readonly kind: 'session'; readonly connection: Connection; readonly key: number };

/** How the page began (`main.tsx`): with an invitation or not, and the first step's answer. */
export interface PageStart {
  readonly joining: boolean;
  readonly first: Promise<FirstStep>;
}

/**
 * The page's sign-in state. Every step is a generation: an answer to an older step never
 * replaces what a newer one shows, and only the session on screen can be signed out by a 401.
 * The invitation's token lives only in the confirmation's state; keeping the current sign-in,
 * a failure or leaving the page forgets it. Back/Forward restoration never shows a world again
 * from memory: with production sign-in the server is asked anew, with personas the form shows.
 */
export function useSignIn(start: PageStart, transport: typeof fetch = fetch) {
  const [screen, setScreen] = useState<SignInScreen>(() =>
    start.joining ? { kind: 'joining' } : { kind: 'checking' },
  );
  const [askingSignOut, setAskingSignOut] = useState(false);
  const step = useRef(0);
  const sessions = useRef(0);
  const active = useRef<Connection | null>(null);
  const mode = useRef<'unknown' | 'personas' | 'invitations'>('unknown');
  // The question a replacement was confirmed for: a second press never sends the token again.
  const confirmed = useRef<SignInScreen | null>(null);

  /** Starts a new generation: whatever an older step still answers is ignored. */
  const next = useCallback((shown: SignInScreen) => {
    step.current += 1;
    active.current = null;
    setAskingSignOut(false);
    setScreen(shown);
    return step.current;
  }, []);

  const enter = useCallback(
    (connection: Connection) => {
      next({ kind: 'session', connection, key: (sessions.current += 1) });
      active.current = connection;
    },
    [next],
  );

  /** A production session for a campaign; a 401 anywhere in it signs the screen out. */
  const enterSession = useCallback(
    (campaignId: string) => {
      const connection: Connection = {
        kind: 'session',
        campaignId,
        onSignedOut: () => {
          if (active.current === connection) next({ kind: 'signed-out', reason: 'ended' });
        },
      };
      enter(connection);
    },
    [enter, next],
  );

  const apply = useCallback(
    (outcome: FirstStep, generation: number) => {
      if (generation !== step.current) return;
      if (outcome.kind === 'personas') mode.current = 'personas';
      else if (outcome.kind !== 'unreachable' && outcome.kind !== 'join-failed') {
        mode.current = 'invitations';
      }
      switch (outcome.kind) {
        case 'signed-in':
        case 'joined':
          enterSession(outcome.campaignId);
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
        case 'join-failed':
          next({ kind: 'join-failed' });
          return;
        case 'confirm':
          next({ kind: 'confirm', token: outcome.token, current: undefined });
          return;
      }
    },
    [enterSession, next],
  );

  // The first step was sent once, when the page loaded; this only waits for its answer.
  useEffect(() => {
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

  // Back/Forward restoration (bfcache) must never show a world from memory.
  useEffect(() => {
    const hide = () => {
      next(mode.current === 'personas' ? { kind: 'personas' } : { kind: 'checking' });
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
  }, [next, probe]);

  return {
    screen,
    /** The sign-out question is open over the world. */
    askingSignOut,
    /** Ask again: after no answer, a failed invitation, or keeping the current sign-in. */
    probe,
    /** The person confirmed: the invitation replaces this browser's sign-in. */
    replace: () => {
      if (screen.kind !== 'confirm' || confirmed.current === screen) return;
      confirmed.current = screen;
      const { token } = screen;
      const generation = next({ kind: 'joining' });
      void redeemInvitation(transport, token, true).then((outcome) => {
        if (generation !== step.current) return;
        if (outcome.kind === 'joined') enterSession(outcome.campaignId);
        else next({ kind: 'join-failed' });
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
      next({ kind: 'signed-out', reason: 'left' });
    },
  };
}
