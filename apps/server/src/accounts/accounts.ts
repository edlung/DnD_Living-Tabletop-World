import { randomUUID } from 'node:crypto';

import {
  ACCOUNT_COOKIE,
  ACCOUNT_SESSION_DAYS,
  RESET_HOURS,
  type AccountCampaign,
  type FinishedCampaign,
  type NewAccount,
  type NextGame,
} from '@ltw/contracts';
import {
  campaignRole,
  knownEntityIds,
  resolvePerspective,
  type Actor,
  type WorldEngine,
  type WorldState,
} from '@ltw/domain';

import { NOTHING_AWAY, type CampaignMoves } from '../campaigns/move/moves.ts';
import { partyPlace } from '../display/display-routes.ts';
import type { CredentialStore } from '../auth/credential-store.ts';
import type { EndingStore } from '../ending/ending-store.ts';
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
  /** When each campaign's table meets again, as the table reads it now (ADR 0071 §3). */
  nextGameOf: (campaignId: string) => Promise<NextGame | null> = () => Promise.resolve(null),
  /** Each campaign's end and keepsakes (ADR 0072 §2); without it nothing is ever finished. */
  ending: EndingStore | null = null,
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
      nextGame: await nextGameOf(seat.campaignId),
      // The party's chapters: every member may read them (ADR 0071 §1), so every seat may count them.
      chapters: [...state.chronicles.values()].filter((chapter) => chapter.perspective === 'PARTY')
        .length,
      place: placeOf(state, actor),
      evening: eveningOf(state),
      finished: ending === null ? null : await finishedOf(state, actor, ending, seat.campaignId),
    });
  }
  return listed;
}

/**
 * The last evening played, as the shelf tells which book to go on with (ADR 0075 §20): the real
 * instant it ended, or began while it still runs. The whole table sat through it: nothing of the
 * world is in it. Null before the first evening.
 */
export function eveningOf(state: WorldState): NonNullable<AccountCampaign['evening']> | null {
  const last = [...state.sessions.values()].at(-1);
  if (last === undefined) return null;
  return { at: last.playedTo ?? last.playedFrom, running: last.playedTo === null };
}

/**
 * Where the party is, as its shelf names it (ADR 0075 §10): the place the table's screen would
 * show, by its name, only when the party knows it — the same test the screen's cast passes.
 */
export function placeOf(state: WorldState, actor: Actor): string | null {
  const locationId = partyPlace(state);
  if (locationId === null) return null;
  const party = resolvePerspective(state, actor, { kind: 'PARTY' });
  if (!party.ok || !knownEntityIds(state, party.perspective).has(locationId)) return null;
  return state.entities.get(locationId)?.name ?? null;
}

/** The characters the party knows, as a member reading the party's view is shown them. */
function heroesOf(state: WorldState, actor: Actor): Set<string> {
  const party = resolvePerspective(state, actor, { kind: 'PARTY' });
  if (!party.ok) return new Set();
  const known = knownEntityIds(state, party.perspective);
  return new Set(
    [...state.entities.values()]
      .filter((entity) => entity.kind === 'character' && known.has(entity.entityId))
      .map((entity) => entity.entityId),
  );
}

/**
 * A finished campaign as its members' list shows it: the days played, the heroes the party knows
 * (as the book's cover names them), and what each of them keeps — what a member reads there as
 * the party (ADR 0072 §2.6). A keepsake the DM chose for someone the party has not met is not
 * this list's to name: inside the campaign it is read without a name, and here it is left out.
 */
async function finishedOf(
  state: WorldState,
  actor: Actor,
  ending: EndingStore,
  campaignId: string,
): Promise<FinishedCampaign | null> {
  const end = await ending.read(campaignId);
  if (end === null) return null;
  const named = (entityId: string) => state.entities.get(entityId)?.name ?? entityId;
  const heroes = heroesOf(state, actor);
  const sessions = [...state.sessions.values()];
  const first = sessions[0];
  const last = sessions.at(-1);
  return {
    finishedAt: end.finishedAt,
    played:
      first === undefined || last === undefined
        ? null
        : { from: first.playedFrom, to: last.playedTo ?? last.playedFrom },
    heroes: [...heroes].map(named).sort((a, b) => a.localeCompare(b)),
    keepsakes: (await ending.keepsakes(campaignId))
      .filter((kept) => heroes.has(kept.characterId))
      .map((kept) => ({
        hero: named(kept.characterId),
        kind: kept.kind,
        label: kept.label,
        line: kept.line,
      })),
  };
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
