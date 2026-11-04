import { randomUUID } from 'node:crypto';

import {
  ACCOUNT_COOKIE,
  ACCOUNT_SESSION_DAYS,
  RESET_HOURS,
  type AccountCampaign,
  type NewAccount,
} from '@ltw/contracts';
import { campaignRole, type WorldEngine } from '@ltw/domain';

import { NOTHING_AWAY, type CampaignMoves } from '../campaigns/move/moves.ts';
import type { CredentialStore } from '../auth/credential-store.ts';
import { iso, type AuthClock } from '../auth/session-authenticator.ts';
import { SESSION_MS } from '../auth/sign-in.ts';
import { cookieTokenFrom, hashToken, newToken } from '../auth/tokens.ts';
import type { AccountRecord, AccountStore, SeatRecord } from './account-store.ts';
import { decoyHash, hashPassword, verifyPassword } from './passwords.ts';

/**
 * Accounts (docs/adr/0041-accounts.md): a login and a password that hold a person's seats. An
 * account never opens a campaign route itself: opening a campaign mints ADR 0036's campaign
 * session for the seat's actor, which the campaign routes check as before.
 */
export const ACCOUNT_SESSION_MS = ACCOUNT_SESSION_DAYS * 24 * 60 * 60_000;
const RESET_MS = RESET_HOURS * 60 * 60_000;

export interface AccountDependencies {
  readonly accounts: AccountStore;
  readonly credentials: CredentialStore;
  readonly clock: AuthClock;
  readonly publicOrigin: string;
}

export interface SignedInAccount {
  readonly account: AccountRecord;
  /** The hash of the account session the request presented. */
  readonly sessionTokenHash: string;
}

/** The account a request's `ltw_account` cookie signs in, or null. */
export async function accountOf(
  deps: Pick<AccountDependencies, 'accounts' | 'clock'>,
  cookie: string | undefined,
): Promise<SignedInAccount | null> {
  const token = cookieTokenFrom(cookie, ACCOUNT_COOKIE);
  if (token === null) return null;
  const session = await deps.accounts.findSession(hashToken(token));
  if (!session || session.revokedAt !== null) return null;
  if (Date.parse(session.expiresAt) <= deps.clock.now()) return null;
  const account = await deps.accounts.findAccount(session.accountId);
  return account ? { account, sessionTokenHash: session.tokenHash } : null;
}

/** Checks a login and a password; the same time and the same null whether the login exists. */
export async function checkPassword(
  accounts: AccountStore,
  login: string,
  password: string,
): Promise<AccountRecord | null> {
  const account = await accounts.findByLogin(login);
  const matches = await verifyPassword(password, account?.passwordHash ?? (await decoyHash()));
  return account && matches ? account : null;
}

/** A new account's record, its password hashed. */
export async function newAccountRecord(input: NewAccount, now: number): Promise<AccountRecord> {
  return {
    accountId: randomUUID(),
    login: input.login,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName,
    createdAt: iso(now),
    passwordChangedAt: iso(now),
  };
}

/** A new account session; its token is returned once, for the cookie. */
export async function openAccountSession(
  deps: Pick<AccountDependencies, 'accounts' | 'clock'>,
  accountId: string,
): Promise<string> {
  const token = newToken();
  const now = deps.clock.now();
  await deps.accounts.createSession({
    sessionId: randomUUID(),
    tokenHash: hashToken(token),
    accountId,
    createdAt: iso(now),
    expiresAt: iso(now + ACCOUNT_SESSION_MS),
  });
  return token;
}

/** The account's campaigns as its hub lists them; seats whose actor is no member are left out. */
export async function campaignsOf(
  engine: WorldEngine,
  seats: readonly SeatRecord[],
  moves: CampaignMoves = NOTHING_AWAY,
): Promise<AccountCampaign[]> {
  const listed: AccountCampaign[] = [];
  for (const seat of seats) {
    const state = (await engine.load(seat.campaignId))?.state ?? null;
    const actor = { actorId: seat.actorId, kind: 'user' } as const;
    const campaign = state?.campaign;
    if (!state || !campaign || campaignRole(state, actor) === null) continue;
    const characters = [...state.roster.entries()]
      .filter(([, player]) => player === seat.actorId)
      .map(([entityId]) => ({ entityId, name: state.entities.get(entityId)?.name ?? entityId }));
    listed.push({
      campaignId: seat.campaignId,
      name: campaign.name,
      role: seat.role,
      language: campaign.language,
      characters,
      away: await moves.awayOf(seat.campaignId),
    });
  }
  return listed;
}

/**
 * Mints a campaign session for a seat whose actor is still a member there; null otherwise. The
 * session descends from the invitation the seat came from (ADR 0041 §2).
 */
export async function enterSeat(
  engine: WorldEngine,
  deps: Pick<AccountDependencies, 'credentials' | 'clock'>,
  seat: SeatRecord,
): Promise<string | null> {
  const state = (await engine.load(seat.campaignId))?.state ?? null;
  if (campaignRole(state, { actorId: seat.actorId, kind: 'user' }) === null) return null;
  const token = newToken();
  const now = deps.clock.now();
  await deps.credentials.createSession({
    sessionId: randomUUID(),
    tokenHash: hashToken(token),
    campaignId: seat.campaignId,
    actorId: seat.actorId,
    invitationId: seat.invitationId,
    createdAt: iso(now),
    expiresAt: iso(now + SESSION_MS),
  });
  return token;
}

/** A single-use reset link for an account (operator or a DM of a shared campaign). */
export async function issueReset(
  deps: Pick<AccountDependencies, 'accounts' | 'clock' | 'publicOrigin'>,
  accountId: string,
  createdBy: string,
): Promise<{ readonly link: string; readonly expiresAt: string }> {
  const token = newToken();
  const now = deps.clock.now();
  const expiresAt = iso(now + RESET_MS);
  await deps.accounts.createReset({
    resetId: randomUUID(),
    tokenHash: hashToken(token),
    accountId,
    createdBy,
    createdAt: iso(now),
    expiresAt,
  });
  return { link: `${deps.publicOrigin}/reset#${token}`, expiresAt };
}
