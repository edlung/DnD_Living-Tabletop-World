import type pg from 'pg';

import type { SeatRole } from '@ltw/contracts';

import type {
  AccountRecord,
  AccountSessionRecord,
  AccountStore,
  ResetRecord,
  SeatRecord,
} from './account-store.ts';

/**
 * Accounts on PostgreSQL (migration 0027_accounts.sql). A login and a seat are unique by
 * constraint, so two concurrent writers cannot both win; a reset is used by one conditional update.
 */
const UNIQUE_VIOLATION = '23505';

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === UNIQUE_VIOLATION;

interface AccountRow {
  readonly account_id: string;
  readonly login: string;
  readonly password_hash: string;
  readonly display_name: string;
  readonly created_at: Date;
  readonly password_changed_at: Date;
}

interface SeatRow {
  readonly account_id: string;
  readonly campaign_id: string;
  readonly actor_id: string;
  readonly role: SeatRole;
  readonly invitation_id: string;
  readonly joined_at: Date;
}

interface SessionRow {
  readonly session_id: string;
  readonly token_hash: string;
  readonly account_id: string;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly revoked_at: Date | null;
}

const ACCOUNT_COLUMNS =
  'account_id, login, password_hash, display_name, created_at, password_changed_at';
const SEAT_COLUMNS = 'account_id, campaign_id, actor_id, role, invitation_id, joined_at';

const toAccount = (row: AccountRow): AccountRecord => ({
  accountId: row.account_id,
  login: row.login,
  passwordHash: row.password_hash,
  displayName: row.display_name,
  createdAt: row.created_at.toISOString(),
  passwordChangedAt: row.password_changed_at.toISOString(),
});

const toSeat = (row: SeatRow): SeatRecord => ({
  accountId: row.account_id,
  campaignId: row.campaign_id,
  actorId: row.actor_id,
  role: row.role,
  invitationId: row.invitation_id,
  joinedAt: row.joined_at.toISOString(),
});

export class PostgresAccountStore implements AccountStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async createAccount(account: AccountRecord): Promise<boolean> {
    try {
      await this.#pool.query(
        `INSERT INTO ltw_accounts (${ACCOUNT_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          account.accountId,
          account.login,
          account.passwordHash,
          account.displayName,
          account.createdAt,
          account.passwordChangedAt,
        ],
      );
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  async findByLogin(login: string): Promise<AccountRecord | null> {
    const { rows } = await this.#pool.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS} FROM ltw_accounts WHERE login = $1`,
      [login],
    );
    const row = rows[0];
    return row ? toAccount(row) : null;
  }

  async findAccount(accountId: string): Promise<AccountRecord | null> {
    const { rows } = await this.#pool.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS} FROM ltw_accounts WHERE account_id = $1`,
      [accountId],
    );
    const row = rows[0];
    return row ? toAccount(row) : null;
  }

  async setPassword(accountId: string, passwordHash: string, at: string): Promise<void> {
    await this.#pool.query(
      `UPDATE ltw_accounts SET password_hash = $2, password_changed_at = $3 WHERE account_id = $1`,
      [accountId, passwordHash, at],
    );
  }

  async setDisplayName(accountId: string, displayName: string): Promise<void> {
    await this.#pool.query(`UPDATE ltw_accounts SET display_name = $2 WHERE account_id = $1`, [
      accountId,
      displayName,
    ]);
  }

  async addSeat(seat: SeatRecord): Promise<boolean> {
    try {
      await this.#pool.query(
        `INSERT INTO ltw_account_seats (${SEAT_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          seat.accountId,
          seat.campaignId,
          seat.actorId,
          seat.role,
          seat.invitationId,
          seat.joinedAt,
        ],
      );
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  async seats(accountId: string): Promise<readonly SeatRecord[]> {
    const { rows } = await this.#pool.query<SeatRow>(
      `SELECT ${SEAT_COLUMNS} FROM ltw_account_seats WHERE account_id = $1 ORDER BY joined_at`,
      [accountId],
    );
    return rows.map(toSeat);
  }

  async seatOfActor(campaignId: string, actorId: string): Promise<SeatRecord | null> {
    const { rows } = await this.#pool.query<SeatRow>(
      `SELECT ${SEAT_COLUMNS} FROM ltw_account_seats WHERE campaign_id = $1 AND actor_id = $2`,
      [campaignId, actorId],
    );
    const row = rows[0];
    return row ? toSeat(row) : null;
  }

  async removeSeats(campaignId: string, actorId: string): Promise<number> {
    const { rowCount } = await this.#pool.query(
      `DELETE FROM ltw_account_seats WHERE campaign_id = $1 AND actor_id = $2`,
      [campaignId, actorId],
    );
    return rowCount ?? 0;
  }

  async createSession(session: Omit<AccountSessionRecord, 'revokedAt'>): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_account_sessions (session_id, token_hash, account_id, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        session.sessionId,
        session.tokenHash,
        session.accountId,
        session.createdAt,
        session.expiresAt,
      ],
    );
  }

  async findSession(tokenHash: string): Promise<AccountSessionRecord | null> {
    const { rows } = await this.#pool.query<SessionRow>(
      `SELECT session_id, token_hash, account_id, created_at, expires_at, revoked_at
       FROM ltw_account_sessions WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = rows[0];
    return row
      ? {
          sessionId: row.session_id,
          tokenHash: row.token_hash,
          accountId: row.account_id,
          createdAt: row.created_at.toISOString(),
          expiresAt: row.expires_at.toISOString(),
          revokedAt: row.revoked_at?.toISOString() ?? null,
        }
      : null;
  }

  async revokeSession(tokenHash: string, now: string): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      `UPDATE ltw_account_sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash, now],
    );
    return rowCount === 1;
  }

  async revokeSessions(accountId: string, now: string, keepTokenHash?: string): Promise<number> {
    const { rowCount } = await this.#pool.query(
      `UPDATE ltw_account_sessions SET revoked_at = $2
       WHERE account_id = $1 AND revoked_at IS NULL AND expires_at > $2
         AND token_hash IS DISTINCT FROM $3`,
      [accountId, now, keepTokenHash ?? null],
    );
    return rowCount ?? 0;
  }

  async createReset(reset: Omit<ResetRecord, 'usedAt'>): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_account_resets (reset_id, token_hash, account_id, created_by, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        reset.resetId,
        reset.tokenHash,
        reset.accountId,
        reset.createdBy,
        reset.createdAt,
        reset.expiresAt,
      ],
    );
  }

  async useReset(tokenHash: string, now: string): Promise<string | null> {
    const { rows } = await this.#pool.query<{ account_id: string }>(
      `UPDATE ltw_account_resets SET used_at = $2
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2
       RETURNING account_id`,
      [tokenHash, now],
    );
    return rows[0]?.account_id ?? null;
  }
}
