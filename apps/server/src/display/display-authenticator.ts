import { iso, type AuthClock } from '../auth/session-authenticator.ts';
import { cookieTokenFrom, hashToken } from '../auth/tokens.ts';
import type { Authenticator, Principal } from '../http/auth.ts';
import type { DisplayStore } from './display-store.ts';

/**
 * A paired display's credential (docs/adr/0042-table-display.md §1–2): the `ltw_display` cookie
 * names a device paired to one campaign, which reads that campaign's PUBLIC and PARTY views as an
 * actor of kind `display` and writes nothing (`authenticate` refuses its every write). A pending,
 * revoked or expired device is nobody.
 */
export const DISPLAY_COOKIE = 'ltw_display';

export const displayActorId = (displayId: string): string => `display:${displayId}`;

export function displayAuthenticator(store: DisplayStore, clock: AuthClock): Authenticator {
  return {
    async authenticate(credentials): Promise<Principal | null> {
      const token = cookieTokenFrom(credentials.cookie, DISPLAY_COOKIE);
      if (token === null) return null;
      const display = await store.findDisplay(hashToken(token));
      const now = iso(clock.now());
      if (
        !display ||
        display.campaignId === null ||
        display.revokedAt !== null ||
        display.expiresAt <= now
      ) {
        return null;
      }
      // Coarse and best effort: being seen never decides an answer.
      await store.displaySeen(display.displayId, now).catch(() => undefined);
      return {
        actor: { actorId: displayActorId(display.displayId), kind: 'display' },
        campaignId: display.campaignId,
      };
    },
  };
}

/** A person's credential first (a session or a persona), then a display's. */
export function personOrDisplay(person: Authenticator, display: Authenticator): Authenticator {
  return {
    async authenticate(credentials) {
      return (await person.authenticate(credentials)) ?? display.authenticate(credentials);
    },
  };
}
