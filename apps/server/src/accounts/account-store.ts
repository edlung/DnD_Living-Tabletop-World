import type { SeatRole } from '@ltw/contracts';

/**
 * Stored accounts (docs/adr/0041-accounts.md; migration 0027_accounts.sql): logins with their
 * password hashes, the seats an account holds (its actor in each campaign), account sessions and
 * reset links by the SHA-256 of their tokens. Never a token or a password. Times are ISO-8601
 * strings; `now` is always the caller's. Not canonical: membership is the World Engine's roster.
 */
export interface AccountRecord {
  readonly accountId: string;
  /** Lower case: logins compare case-insensitively. */
  readonly login: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly createdAt: string;
  readonly passwordChangedAt: string;
}

export interface SeatRecord {
  readonly accountId: string;
  readonly campaignId: string;
  readonly actorId: string;
  readonly role: SeatRole;
  /** The invitation the seat came from: the campaign sessions it opens descend from it. */
  readonly invitationId: string;
  readonly joinedAt: string;
}

export interface AccountSessionRecord {
  readonly sessionId: string;
  readonly tokenHash: string;
  readonly accountId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface ResetRecord {
  readonly resetId: string;
  readonly tokenHash: string;
  readonly accountId: string;
  /** `operator`, or the DM's actor who issued it. */
  readonly createdBy: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly usedAt: string | null;
}

export interface AccountStore {
  /** False when the login is taken (nothing is written then). */
  createAccount(account: AccountRecord): Promise<boolean>;
  findByLogin(login: string): Promise<AccountRecord | null>;
  findAccount(accountId: string): Promise<AccountRecord | null>;
  setPassword(accountId: string, passwordHash: string, at: string): Promise<void>;
  setDisplayName(accountId: string, displayName: string): Promise<void>;
  /**
   * Adds a seat; false when the account already sits in that campaign, or that campaign's actor
   * belongs to another account (nothing is written then).
   */
  addSeat(seat: SeatRecord): Promise<boolean>;
  seats(accountId: string): Promise<readonly SeatRecord[]>;
  /** The account holding this campaign's actor, if any. */
  seatOfActor(campaignId: string, actorId: string): Promise<SeatRecord | null>;
  /** Removes the seats of this campaign's actor (the DM's revocation); how many. */
  removeSeats(campaignId: string, actorId: string): Promise<number>;
  createSession(session: Omit<AccountSessionRecord, 'revokedAt'>): Promise<void>;
  findSession(tokenHash: string): Promise<AccountSessionRecord | null>;
  revokeSession(tokenHash: string, now: string): Promise<boolean>;
  /** Revokes every live session of the account (a reset, a password change), but one; how many. */
  revokeSessions(accountId: string, now: string, keepTokenHash?: string): Promise<number>;
  createReset(reset: Omit<ResetRecord, 'usedAt'>): Promise<void>;
  /** Uses a live reset link once: the account it belongs to, or null (unknown, used, expired). */
  useReset(tokenHash: string, now: string): Promise<string | null>;
}

export class InMemoryAccountStore implements AccountStore {
  readonly #accounts = new Map<string, AccountRecord>();
  readonly #seats: SeatRecord[] = [];
  readonly #sessions = new Map<string, AccountSessionRecord>();
  readonly #resets = new Map<string, ResetRecord>();

  createAccount(account: AccountRecord): Promise<boolean> {
    const taken = [...this.#accounts.values()].some((other) => other.login === account.login);
    if (taken || this.#accounts.has(account.accountId)) return Promise.resolve(false);
    this.#accounts.set(account.accountId, account);
    return Promise.resolve(true);
  }

  findByLogin(login: string): Promise<AccountRecord | null> {
    const found = [...this.#accounts.values()].find((account) => account.login === login);
    return Promise.resolve(found ?? null);
  }

  findAccount(accountId: string): Promise<AccountRecord | null> {
    return Promise.resolve(this.#accounts.get(accountId) ?? null);
  }

  setPassword(accountId: string, passwordHash: string, at: string): Promise<void> {
    const account = this.#accounts.get(accountId);
    if (account) {
      this.#accounts.set(accountId, { ...account, passwordHash, passwordChangedAt: at });
    }
    return Promise.resolve();
  }

  setDisplayName(accountId: string, displayName: string): Promise<void> {
    const account = this.#accounts.get(accountId);
    if (account) this.#accounts.set(accountId, { ...account, displayName });
    return Promise.resolve();
  }

  addSeat(seat: SeatRecord): Promise<boolean> {
    const clash = this.#seats.some(
      (other) =>
        other.campaignId === seat.campaignId &&
        (other.accountId === seat.accountId || other.actorId === seat.actorId),
    );
    if (clash) return Promise.resolve(false);
    this.#seats.push(seat);
    return Promise.resolve(true);
  }

  seats(accountId: string): Promise<readonly SeatRecord[]> {
    return Promise.resolve(this.#seats.filter((seat) => seat.accountId === accountId));
  }

  seatOfActor(campaignId: string, actorId: string): Promise<SeatRecord | null> {
    const found = this.#seats.find(
      (seat) => seat.campaignId === campaignId && seat.actorId === actorId,
    );
    return Promise.resolve(found ?? null);
  }

  removeSeats(campaignId: string, actorId: string): Promise<number> {
    let removed = 0;
    for (let index = this.#seats.length - 1; index >= 0; index -= 1) {
      const seat = this.#seats[index];
      if (seat?.campaignId === campaignId && seat.actorId === actorId) {
        this.#seats.splice(index, 1);
        removed += 1;
      }
    }
    return Promise.resolve(removed);
  }

  createSession(session: Omit<AccountSessionRecord, 'revokedAt'>): Promise<void> {
    this.#sessions.set(session.tokenHash, { ...session, revokedAt: null });
    return Promise.resolve();
  }

  findSession(tokenHash: string): Promise<AccountSessionRecord | null> {
    return Promise.resolve(this.#sessions.get(tokenHash) ?? null);
  }

  revokeSession(tokenHash: string, now: string): Promise<boolean> {
    const session = this.#sessions.get(tokenHash);
    if (!session || session.revokedAt !== null) return Promise.resolve(false);
    this.#sessions.set(tokenHash, { ...session, revokedAt: now });
    return Promise.resolve(true);
  }

  revokeSessions(accountId: string, now: string, keepTokenHash?: string): Promise<number> {
    let revoked = 0;
    for (const [hash, session] of this.#sessions) {
      if (session.accountId !== accountId || session.revokedAt !== null) continue;
      if (hash === keepTokenHash || Date.parse(session.expiresAt) <= Date.parse(now)) continue;
      this.#sessions.set(hash, { ...session, revokedAt: now });
      revoked += 1;
    }
    return Promise.resolve(revoked);
  }

  createReset(reset: Omit<ResetRecord, 'usedAt'>): Promise<void> {
    this.#resets.set(reset.tokenHash, { ...reset, usedAt: null });
    return Promise.resolve();
  }

  useReset(tokenHash: string, now: string): Promise<string | null> {
    const reset = this.#resets.get(tokenHash);
    if (!reset || reset.usedAt !== null || Date.parse(reset.expiresAt) <= Date.parse(now)) {
      return Promise.resolve(null);
    }
    this.#resets.set(tokenHash, { ...reset, usedAt: now });
    return Promise.resolve(reset.accountId);
  }
}
