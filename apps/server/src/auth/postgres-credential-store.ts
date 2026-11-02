import type pg from 'pg';

import type {
  CredentialStore,
  InvitationRecord,
  LiveSession,
  NewInvitation,
  NewSession,
  RedeemAttempt,
  RevokeInvitationOutcome,
  SessionRecord,
  SessionSummary,
} from './credential-store.ts';

/**
 * PostgreSQL credentials (migration 0010_auth.sql; docs/adr/0036-production-sign-in.md). Every
 * change is one conditional statement, or one transaction for a redeem, so concurrent redeems of
 * one invitation settle on exactly one session. Errors carry hashes at most, never a token.
 */
interface InvitationRow {
  readonly invitation_id: string;
  readonly token_hash: string;
  readonly campaign_id: string;
  readonly purpose: 'player' | 'dm';
  readonly character_id: string | null;
  readonly created_by: string;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly actor_id: string | null;
  readonly used_at: Date | null;
  readonly revoked_at: Date | null;
}

interface SessionRow {
  readonly session_id: string;
  readonly token_hash: string;
  readonly campaign_id: string;
  readonly actor_id: string;
  readonly invitation_id: string;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly last_seen_at: Date;
  readonly revoked_at: Date | null;
}

const INVITATION_COLUMNS =
  'invitation_id, token_hash, campaign_id, purpose, character_id, created_by, created_at, expires_at, actor_id, used_at, revoked_at';
const SESSION_COLUMNS =
  'session_id, token_hash, campaign_id, actor_id, invitation_id, created_at, expires_at, last_seen_at, revoked_at';

const time = (value: Date | null) => (value === null ? null : value.toISOString());

const toInvitation = (row: InvitationRow): InvitationRecord => ({
  invitationId: row.invitation_id,
  tokenHash: row.token_hash,
  campaignId: row.campaign_id,
  purpose: row.purpose,
  characterId: row.character_id,
  createdBy: row.created_by,
  createdAt: row.created_at.toISOString(),
  expiresAt: row.expires_at.toISOString(),
  actorId: row.actor_id,
  usedAt: time(row.used_at),
  revokedAt: time(row.revoked_at),
});

const toSession = (row: SessionRow): SessionRecord => ({
  sessionId: row.session_id,
  tokenHash: row.token_hash,
  campaignId: row.campaign_id,
  actorId: row.actor_id,
  invitationId: row.invitation_id,
  createdAt: row.created_at.toISOString(),
  expiresAt: row.expires_at.toISOString(),
  lastSeenAt: row.last_seen_at.toISOString(),
  revokedAt: time(row.revoked_at),
});

export class PostgresCredentialStore implements CredentialStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async createInvitation(invitation: NewInvitation): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_auth_invitations
         (invitation_id, token_hash, campaign_id, purpose, character_id, created_by,
          created_at, expires_at, actor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        invitation.invitationId,
        invitation.tokenHash,
        invitation.campaignId,
        invitation.purpose,
        invitation.characterId,
        invitation.createdBy,
        invitation.createdAt,
        invitation.expiresAt,
        invitation.actorId,
      ],
    );
  }

  async findInvitation(tokenHash: string): Promise<InvitationRecord | null> {
    const { rows } = await this.#pool.query<InvitationRow>(
      `SELECT ${INVITATION_COLUMNS} FROM ltw_auth_invitations WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = rows[0];
    return row ? toInvitation(row) : null;
  }

  async claimActor(invitationId: string, candidate: string): Promise<string> {
    // Racing claims wait on the row; the second sees the first's actor and keeps it.
    const { rows } = await this.#pool.query<{ actor_id: string }>(
      `UPDATE ltw_auth_invitations SET actor_id = COALESCE(actor_id, $2)
        WHERE invitation_id = $1 RETURNING actor_id`,
      [invitationId, candidate],
    );
    const actorId = rows[0]?.actor_id;
    if (actorId === undefined) throw new Error('unknown invitation');
    return actorId;
  }

  async completeRedeem(invitationId: string, session: NewSession, now: string): Promise<boolean> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const used = await client.query<{ campaign_id: string; character_id: string | null }>(
        `UPDATE ltw_auth_invitations SET used_at = $2
          WHERE invitation_id = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > $2
          RETURNING campaign_id, character_id`,
        [invitationId, now],
      );
      const invitation = used.rows[0];
      if (!invitation) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(
        `INSERT INTO ltw_auth_sessions (${SESSION_COLUMNS})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $6, NULL)`,
        [
          session.sessionId,
          session.tokenHash,
          session.campaignId,
          session.actorId,
          session.invitationId,
          session.createdAt,
          session.expiresAt,
        ],
      );
      if (invitation.character_id !== null) {
        // The seat is taken: the character's other open invitations can no longer seat anyone.
        await client.query(
          `UPDATE ltw_auth_invitations SET revoked_at = $3
            WHERE campaign_id = $1 AND character_id = $2
              AND used_at IS NULL AND revoked_at IS NULL`,
          [invitation.campaign_id, invitation.character_id, now],
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createSession(session: NewSession): Promise<void> {
    // Only from a used invitation: the seat's own, never one still open.
    const { rowCount } = await this.#pool.query(
      `INSERT INTO ltw_auth_sessions (${SESSION_COLUMNS})
       SELECT $1, $2, $3, $4, $5, $6, $7, $6, NULL
       FROM ltw_auth_invitations
       WHERE invitation_id = $5 AND used_at IS NOT NULL AND campaign_id = $3`,
      [
        session.sessionId,
        session.tokenHash,
        session.campaignId,
        session.actorId,
        session.invitationId,
        session.createdAt,
        session.expiresAt,
      ],
    );
    if (rowCount !== 1) throw new Error('a session needs a used invitation of its campaign');
  }

  async findSession(tokenHash: string): Promise<SessionRecord | null> {
    const { rows } = await this.#pool.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM ltw_auth_sessions WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = rows[0];
    return row ? toSession(row) : null;
  }

  async touchSession(sessionId: string, now: string, staleBefore: string): Promise<void> {
    await this.#pool.query(
      `UPDATE ltw_auth_sessions SET last_seen_at = $2
        WHERE session_id = $1 AND last_seen_at < $3 AND last_seen_at < $2`,
      [sessionId, now, staleBefore],
    );
  }

  async revokeSession(tokenHash: string, now: string): Promise<boolean> {
    const { rows } = await this.#pool.query<{ expires_at: Date }>(
      `UPDATE ltw_auth_sessions SET revoked_at = $2
        WHERE token_hash = $1 AND revoked_at IS NULL RETURNING expires_at`,
      [tokenHash, now],
    );
    const expiresAt = rows[0]?.expires_at;
    return expiresAt !== undefined && Date.parse(now) < expiresAt.getTime();
  }

  async revokeActorSessions(campaignId: string, actorId: string, now: string): Promise<number> {
    const { rowCount } = await this.#pool.query(
      `UPDATE ltw_auth_sessions SET revoked_at = $3
        WHERE campaign_id = $1 AND actor_id = $2 AND revoked_at IS NULL`,
      [campaignId, actorId, now],
    );
    return rowCount ?? 0;
  }

  async revokeSessionsEverywhere(actorId: string, now: string): Promise<number> {
    const { rowCount } = await this.#pool.query(
      `UPDATE ltw_auth_sessions SET revoked_at = $2 WHERE actor_id = $1 AND revoked_at IS NULL`,
      [actorId, now],
    );
    return rowCount ?? 0;
  }

  async revokeActorInvitations(
    actorId: string,
    campaignId: string | null,
    now: string,
  ): Promise<number> {
    const { rowCount } = await this.#pool.query(
      `UPDATE ltw_auth_invitations SET revoked_at = $3
        WHERE actor_id = $1 AND ($2::text IS NULL OR campaign_id = $2)
          AND used_at IS NULL AND revoked_at IS NULL`,
      [actorId, campaignId, now],
    );
    return rowCount ?? 0;
  }

  async liveSessions(campaignId: string, now: string): Promise<readonly LiveSession[]> {
    // Selected without the token hash: it never leaves the database for a listing.
    const { rows } = await this.#pool.query<Omit<SessionRow, 'token_hash' | 'revoked_at'>>(
      `SELECT session_id, campaign_id, actor_id, invitation_id, created_at, expires_at, last_seen_at
         FROM ltw_auth_sessions
        WHERE campaign_id = $1 AND revoked_at IS NULL AND expires_at > $2
        ORDER BY created_at, session_id`,
      [campaignId, now],
    );
    return rows.map((row) => ({
      sessionId: row.session_id,
      campaignId: row.campaign_id,
      actorId: row.actor_id,
      invitationId: row.invitation_id,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      lastSeenAt: row.last_seen_at.toISOString(),
    }));
  }

  async revokeCharacterInvitations(
    campaignId: string,
    characterId: string,
    now: string,
  ): Promise<number> {
    const { rowCount } = await this.#pool.query(
      `UPDATE ltw_auth_invitations SET revoked_at = $3
        WHERE campaign_id = $1 AND character_id = $2 AND used_at IS NULL AND revoked_at IS NULL`,
      [campaignId, characterId, now],
    );
    return rowCount ?? 0;
  }

  async revokeInvitation(
    campaignId: string,
    invitationId: string,
    now: string,
  ): Promise<RevokeInvitationOutcome> {
    const revoked = await this.#pool.query(
      `UPDATE ltw_auth_invitations SET revoked_at = $3
        WHERE campaign_id = $1 AND invitation_id = $2 AND used_at IS NULL AND revoked_at IS NULL`,
      [campaignId, invitationId, now],
    );
    if (revoked.rowCount === 1) return 'revoked';
    const { rows } = await this.#pool.query<{ used_at: Date | null; revoked_at: Date | null }>(
      `SELECT used_at, revoked_at FROM ltw_auth_invitations
        WHERE campaign_id = $1 AND invitation_id = $2`,
      [campaignId, invitationId],
    );
    const row = rows[0];
    if (!row) return 'missing';
    return row.revoked_at !== null ? 'already-revoked' : 'used';
  }

  async listInvitations(campaignId: string, limit: number): Promise<readonly InvitationRecord[]> {
    const { rows } = await this.#pool.query<InvitationRow>(
      `SELECT ${INVITATION_COLUMNS} FROM ltw_auth_invitations
        WHERE campaign_id = $1 ORDER BY created_at DESC, invitation_id LIMIT $2`,
      [campaignId, limit],
    );
    return rows.map(toInvitation);
  }

  async sessionSummaries(
    campaignId: string,
    actorIds: readonly string[],
    now: string,
  ): Promise<ReadonlyMap<string, SessionSummary>> {
    const summaries = new Map<string, SessionSummary>(
      actorIds.map((actorId) => [actorId, { active: 0, lastSeenAt: null }]),
    );
    if (actorIds.length === 0) return summaries;
    const { rows } = await this.#pool.query<{
      actor_id: string;
      active: string;
      last_seen_at: Date | null;
    }>(
      `SELECT actor_id, count(*) AS active, max(last_seen_at) AS last_seen_at
         FROM ltw_auth_sessions
        WHERE campaign_id = $1 AND actor_id = ANY($2::text[])
          AND revoked_at IS NULL AND expires_at > $3
        GROUP BY actor_id`,
      [campaignId, [...actorIds], now],
    );
    for (const row of rows) {
      summaries.set(row.actor_id, {
        active: Number(row.active),
        lastSeenAt: time(row.last_seen_at),
      });
    }
    return summaries;
  }

  async recordAttempt(attempt: RedeemAttempt): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_auth_attempts (at, outcome, source_key, prefix_key) VALUES ($1, $2, $3, $4)`,
      [attempt.at, attempt.outcome, attempt.sourceKey, attempt.prefixKey],
    );
  }

  async prune(cutoffs: {
    readonly attemptsBefore: string;
    readonly sessionsExpiredBefore: string;
  }): Promise<{ readonly attempts: number; readonly sessions: number }> {
    const attempts = await this.#pool.query('DELETE FROM ltw_auth_attempts WHERE at < $1', [
      cutoffs.attemptsBefore,
    ]);
    const sessions = await this.#pool.query('DELETE FROM ltw_auth_sessions WHERE expires_at < $1', [
      cutoffs.sessionsExpiredBefore,
    ]);
    return { attempts: attempts.rowCount ?? 0, sessions: sessions.rowCount ?? 0 };
  }

  /** Attempts recorded so far, oldest first: for the operator and tests. */
  async attempts(): Promise<readonly RedeemAttempt[]> {
    const { rows } = await this.#pool.query<{
      at: Date;
      outcome: RedeemAttempt['outcome'];
      source_key: string;
      prefix_key: string | null;
    }>('SELECT at, outcome, source_key, prefix_key FROM ltw_auth_attempts ORDER BY attempt_id');
    return rows.map((row) => ({
      at: row.at.toISOString(),
      outcome: row.outcome,
      sourceKey: row.source_key,
      prefixKey: row.prefix_key,
    }));
  }
}
