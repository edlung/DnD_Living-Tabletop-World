import type { Authenticator } from '../http/auth.ts';
import type { CredentialStore } from './credential-store.ts';
import { hashToken, sessionTokenFrom } from './tokens.ts';

/**
 * Invitation mode (docs/adr/0036-production-sign-in.md §3, §5): the session cookie is the only
 * credential; an `Authorization` header is ignored. A session is live until it expires (14 days
 * after sign-in) or is revoked (sign-out, the DM's revocation); every request and every live
 * stream cycle looks it up again, so revocation takes effect on the next one.
 */
export interface AuthClock {
  /** Milliseconds since the epoch. */
  now(): number;
}

export const systemAuthClock: AuthClock = { now: () => Date.now() };

/** How often a session's `last_seen_at` is written at most. */
export const LAST_SEEN_GRANULARITY_MS = 5 * 60_000;

export const iso = (ms: number): string => new Date(ms).toISOString();

export function sessionAuthenticator(store: CredentialStore, clock: AuthClock): Authenticator {
  return {
    async authenticate({ cookie }) {
      const token = sessionTokenFrom(cookie);
      if (token === null) return null;
      const session = await store.findSession(hashToken(token));
      const now = clock.now();
      if (!session || session.revokedAt !== null || Date.parse(session.expiresAt) <= now) {
        return null;
      }
      if (now - Date.parse(session.lastSeenAt) >= LAST_SEEN_GRANULARITY_MS) {
        await store.touchSession(
          session.sessionId,
          iso(now),
          iso(now - LAST_SEEN_GRANULARITY_MS + 1),
        );
      }
      return { actor: { actorId: session.actorId, kind: 'user' }, campaignId: session.campaignId };
    },
  };
}
