import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { CampaignTemplate, EntityRef, NewAccount, TableKey } from '@ltw/contracts';

import type { Connection } from '../api/client.ts';
import {
  createCampaign,
  enterCampaign,
  readAccount,
  resetPassword,
  signInWithPassword,
  signOutAccount,
} from './account-flow.ts';
import { holdInvitation, type InvitationHolder } from './invitation-link.ts';
import { readTableOffer, takeTableSeat } from './table-flow.ts';
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
  /** `problem`: the last try kept the invitation unspent (Stage 600). */
  | { readonly kind: 'invited'; readonly problem?: 'login-taken' | 'already-seated' }
  | { readonly kind: 'joining' }
  | {
      readonly kind: 'confirm';
      /** Who this browser is signed in as: undefined while it is read, null if unknown. */
      readonly current: CurrentSignIn | null | undefined;
    }
  /** `moved`: the campaign plays on another server since a move (docs/adr/0061-local-mode.md §5). */
  | { readonly kind: 'join-failed'; readonly reason?: 'moved' }
  /** `none`: never signed in here; `ended`: the session ended under it; `left`: signed out. */
  | {
      readonly kind: 'signed-out';
      readonly reason: 'none' | 'ended' | 'left';
      /** A reset set a new password: sign in with it (Stage 600). */
      readonly passwordChanged?: true;
      /** The session ended, but this browser's login is still signed in (Stage 600). */
      readonly withAccount?: true;
    }
  /** The account's hub (Stage 600): its campaigns, a new one, its settings. */
  | { readonly kind: 'hub' }
  /** A reset link waiting for the new password (Stage 600). */
  | { readonly kind: 'reset' }
  /** The table's join link: its free seats, one to choose (ADR 0042). */
  | { readonly kind: 'table'; readonly linked: boolean }
  | { readonly kind: 'session'; readonly connection: Connection; readonly key: number };

const firstScreen = (start: PageStart): SignInScreen =>
  start.kind === 'invited'
    ? { kind: 'invited' }
    : start.kind === 'reset'
      ? { kind: 'reset' }
      : start.kind === 'table'
        ? { kind: 'table', linked: start.key !== null }
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
  // The invitation "Take your seat" spends: the page's, or the one an unspent try handed back.
  const seatHolder = useRef<InvitationHolder | null>(
    start.kind === 'invited' ? start.invitation : null,
  );
  // The table link's token (ADR 0042), read for its seats until one is offered.
  const tableKey = useRef(start.kind === 'table' ? start.key : null);
  const keyOf = (typed: TableKey | null): TableKey | null => {
    const token = tableKey.current?.read() ?? null;
    return typed ?? (token === null ? null : { token });
  };

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
        if (active.current !== connection) return;
        const shown = next({ kind: 'signed-out', reason: 'ended' });
        // A login still signed in here opens its other campaigns (Stage 600).
        void readAccount(transport).then((reading) => {
          if (shown !== step.current || reading.kind !== 'account') return;
          setScreen((screen) =>
            screen.kind === 'signed-out' ? { ...screen, withAccount: true } : screen,
          );
        });
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
        case 'signed-out': {
          // Signed out of every campaign: an account signed in here opens its hub (Stage 600).
          const checking = next({ kind: 'checking' });
          void readAccount(transport).then((reading) => {
            if (checking !== step.current) return;
            next(
              reading.kind === 'account' ? { kind: 'hub' } : { kind: 'signed-out', reason: 'none' },
            );
          });
          return;
        }
        case 'login-taken':
        case 'already-seated':
          // The invitation was not spent: the person may try again (another login).
          seatHolder.current = outcome.retry;
          next({ kind: 'invited', problem: outcome.kind });
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
        case 'moved':
          next({ kind: 'join-failed', reason: 'moved' });
          return;
        case 'needs-confirmation':
          next({ kind: 'confirm', current: undefined });
          // Held for the question alone, outside React state.
          replacement.current = outcome.replacement;
          return;
      }
    },
    [enterSession, next, restart, transport],
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
      seatHolder.current?.forget();
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
    takeSeat: (newAccount: NewAccount | null = null) => {
      const invitation = seatHolder.current;
      if (screen.kind !== 'invited' || invitation === null || !invitation.holds()) return;
      const generation = next({ kind: 'joining' });
      void takeSeat(invitation, transport, newAccount).then((outcome) => {
        if (outcome !== null) apply(outcome, generation);
      });
    },
    /** Signed in with a login and a password: the hub (Stage 600). */
    signInAccount: async (login: string, password: string) => {
      const answer = await signInWithPassword(transport, login, password);
      if (answer === 'signed-in' && screen.kind !== 'invited') next({ kind: 'hub' });
      return answer;
    },
    /** From the hub: a campaign's session is set, then its world opens. */
    openCampaign: async (campaignId: string) => {
      const answer = await enterCampaign(transport, campaignId);
      if (answer.kind === 'entered') enterSession(answer.campaignId);
      return answer;
    },
    /** From the hub: a new campaign from a ready adventure, then its world. */
    createCampaign: async (template: CampaignTemplate) => {
      const answer = await createCampaign(transport, template);
      if (answer.kind === 'entered') enterSession(answer.campaignId);
      return answer;
    },
    /**
     * The account's hub, from a world (the campaign session stays until another one opens) or from
     * a join page whose seat the login already has (the unspent invitation is forgotten).
     */
    toHub: () => {
      seatHolder.current?.forget();
      seatHolder.current = null;
      next({ kind: 'hub' });
    },
    /** The account signs out here, with this browser's campaign session. */
    signOutAccount: async () => {
      await signOutAccount(transport);
      next({ kind: 'signed-out', reason: 'left' });
    },
    /** A reset link's new password: then signing in with it. */
    resetWith: async (password: string) => {
      if (start.kind !== 'reset') return 'failed' as const;
      const token = start.reset.take();
      if (token === null) return 'failed' as const;
      const answer = await resetPassword(transport, token, password);
      if (answer.kind !== 'done') return 'failed' as const;
      next({ kind: 'signed-out', reason: 'none', passwordChanged: true });
      return 'done' as const;
    },
    /** The table link's free seats (ADR 0042): by its token, or by the code typed. */
    tableOffer: async (typed: TableKey | null) => {
      const key = keyOf(typed);
      return key === null ? ('refused' as const) : readTableOffer(transport, key);
    },
    /** A free seat chosen: its single-use invitation goes to the usual join page. */
    tableChoose: async (typed: TableKey | null, character: EntityRef) => {
      const key = keyOf(typed);
      if (key === null) return 'refused' as const;
      const answer = await takeTableSeat(transport, key, character.entityId);
      if (typeof answer === 'string') return answer;
      tableKey.current?.forget();
      tableKey.current = null;
      seatHolder.current = holdInvitation(answer.token);
      next({ kind: 'invited' });
      return 'ok' as const;
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
