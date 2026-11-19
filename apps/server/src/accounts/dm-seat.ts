import { randomUUID } from 'node:crypto';

import type { CredentialStore } from '../auth/credential-store.ts';
import { iso, type AuthClock } from '../auth/session-authenticator.ts';
import { HOUR_MS, SESSION_MS } from '../auth/sign-in.ts';
import { hashToken, newToken } from '../auth/tokens.ts';
import type { AccountStore, SeatRecord } from './account-store.ts';

/**
 * The account a new campaign's DM (docs/adr/0041-accounts.md §5): a DM invitation the account
 * receives and uses at once, so its seat and its campaign session are ADR 0036's like any other.
 * Used by a ready adventure's copy and by a library campaign the hub starts (ADR 0058, notes of
 * 2026-11-19).
 */
export async function seatAccountAsDm(
  deps: {
    readonly accounts: AccountStore;
    readonly credentials: CredentialStore;
    readonly clock: AuthClock;
  },
  accountId: string,
  campaignId: string,
  dmActorId: string,
): Promise<{ readonly seat: SeatRecord; readonly sessionToken: string }> {
  const now = deps.clock.now();
  const invitationId = randomUUID();
  await deps.credentials.createInvitation({
    invitationId,
    tokenHash: hashToken(newToken()),
    campaignId,
    purpose: 'dm',
    characterId: null,
    createdBy: `account:${accountId}`,
    createdAt: iso(now),
    expiresAt: iso(now + HOUR_MS),
    actorId: dmActorId,
  });
  const sessionToken = newToken();
  const used = await deps.credentials.completeRedeem(
    invitationId,
    {
      sessionId: randomUUID(),
      tokenHash: hashToken(sessionToken),
      campaignId,
      actorId: dmActorId,
      invitationId,
      createdAt: iso(now),
      expiresAt: iso(now + SESSION_MS),
    },
    iso(now),
  );
  if (!used) throw new Error('the DM invitation of a new campaign was not used');
  const seat: SeatRecord = {
    accountId,
    campaignId,
    actorId: dmActorId,
    role: 'dm',
    invitationId,
    joinedAt: iso(now),
  };
  if (!(await deps.accounts.addSeat(seat))) throw new Error('the DM seat was not added');
  return { seat, sessionToken };
}
