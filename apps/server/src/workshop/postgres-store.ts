import type { CreateWorkshopDraft, Language, WorkshopDraftView } from '@ltw/contracts';
import type pg from 'pg';

import type {
  DraftCreation,
  RedeemedWorkshopSession,
  WorkshopInvitation,
  WorkshopSession,
  WorkshopStore,
} from './store.ts';

type DraftRow = { draft_id: string; title: string; language: Language; created_at: Date };
const draftView = (row: DraftRow): WorkshopDraftView => ({
  draftId: row.draft_id,
  title: row.title,
  language: row.language,
  createdAt: row.created_at.toISOString(),
});
const DRAFT_COLUMNS = 'draft_id, title, language, created_at';

/** Fixed errors prevent PostgreSQL detail (including hashes) from reaching HTTP logs. */
export class PostgresWorkshopStore implements WorkshopStore {
  readonly #pool: pg.Pool;
  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async #transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    let client: pg.PoolClient | undefined;
    try {
      client = await this.#pool.connect();
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SET LOCAL lock_timeout = '5s'");
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch {
      await client?.query('ROLLBACK').catch(() => undefined);
      throw new Error('WORKSHOP_STORAGE_UNAVAILABLE');
    } finally {
      client?.release();
    }
  }

  async #read<T extends pg.QueryResultRow>(
    text: string,
    values: unknown[],
  ): Promise<pg.QueryResult<T>> {
    return this.#transaction((client) => client.query<T>(text, values));
  }

  async #lockOwners(client: pg.PoolClient, owners: readonly string[]): Promise<void> {
    await client.query(
      'SELECT owner_id FROM ltw_workshop_owners WHERE owner_id = ANY($1::uuid[]) ORDER BY owner_id FOR UPDATE',
      [owners],
    );
  }

  async issueInvitation(input: WorkshopInvitation): Promise<void> {
    await this.#transaction(async (client) => {
      await client.query(
        'INSERT INTO ltw_workshop_owners (owner_id, created_at) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [input.ownerId, input.createdAt],
      );
      await this.#lockOwners(client, [input.ownerId]);
      await client.query(
        `INSERT INTO ltw_workshop_invitations
        (invitation_id, owner_id, token_hash, created_at, expires_at, authorization_source)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.invitationId,
          input.ownerId,
          input.tokenHash,
          input.createdAt,
          input.expiresAt,
          input.authorizationSource,
        ],
      );
    });
  }

  async redeem(
    hash: string,
    session: RedeemedWorkshopSession,
    previous: string | null,
  ): Promise<string | null> {
    return this.#transaction(async (client) => {
      const invite = await client.query<{ owner_id: string }>(
        'SELECT owner_id FROM ltw_workshop_invitations WHERE token_hash = $1',
        [hash],
      );
      const ownerId = invite.rows[0]?.owner_id;
      if (ownerId === undefined) return null;
      const old =
        previous === null
          ? null
          : (
              await client.query<{ owner_id: string }>(
                'SELECT owner_id FROM ltw_workshop_sessions WHERE token_hash = $1',
                [previous],
              )
            ).rows[0];
      await this.#lockOwners(client, old ? [ownerId, old.owner_id] : [ownerId]);
      const spent = await client.query<{ invitation_id: string }>(
        `UPDATE ltw_workshop_invitations SET used_at = $2
        WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND created_at <= $2 AND expires_at > $2
        RETURNING invitation_id`,
        [hash, session.createdAt],
      );
      const invitationId = spent.rows[0]?.invitation_id;
      if (invitationId === undefined) return null;
      await client.query(
        `INSERT INTO ltw_workshop_sessions
        (session_id, owner_id, invitation_id, token_hash, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          session.sessionId,
          ownerId,
          invitationId,
          session.tokenHash,
          session.createdAt,
          session.expiresAt,
        ],
      );
      if (previous !== null)
        await client.query(
          'UPDATE ltw_workshop_sessions SET revoked_at = COALESCE(revoked_at, $2) WHERE token_hash = $1',
          [previous, session.createdAt],
        );
      return ownerId;
    });
  }

  async session(hash: string, now: string): Promise<WorkshopSession | null> {
    const result = await this.#read<{
      session_id: string;
      owner_id: string;
      invitation_id: string;
      token_hash: string;
      created_at: Date;
      expires_at: Date;
    }>(
      `SELECT session_id, owner_id, invitation_id, token_hash, created_at, expires_at FROM ltw_workshop_sessions
      WHERE token_hash = $1 AND revoked_at IS NULL AND created_at <= $2 AND expires_at > $2`,
      [hash, now],
    );
    const row = result.rows[0];
    return row
      ? {
          sessionId: row.session_id,
          ownerId: row.owner_id,
          invitationId: row.invitation_id,
          tokenHash: row.token_hash,
          createdAt: row.created_at.toISOString(),
          expiresAt: row.expires_at.toISOString(),
        }
      : null;
  }

  async signOut(hash: string, now: string): Promise<void> {
    await this.#read(
      'UPDATE ltw_workshop_sessions SET revoked_at = COALESCE(revoked_at, $2) WHERE token_hash = $1',
      [hash, now],
    );
  }

  async revokeOwner(ownerId: string, now: string, source: string): Promise<void> {
    await this.#transaction(async (client) => {
      await this.#lockOwners(client, [ownerId]);
      await client.query(
        'INSERT INTO ltw_workshop_revocations (owner_id, at, authorization_source) SELECT owner_id, $2, $3 FROM ltw_workshop_owners WHERE owner_id = $1',
        [ownerId, now, source],
      );
      await client.query(
        'UPDATE ltw_workshop_invitations SET revoked_at = COALESCE(revoked_at, $2) WHERE owner_id = $1',
        [ownerId, now],
      );
      await client.query(
        'UPDATE ltw_workshop_sessions SET revoked_at = COALESCE(revoked_at, $2) WHERE owner_id = $1',
        [ownerId, now],
      );
    });
  }

  async createDraft(
    ownerId: string,
    input: CreateWorkshopDraft,
    draftId: string,
    now: string,
  ): Promise<DraftCreation> {
    return this.#transaction(async (client) => {
      const result = await client.query<DraftRow>(
        `INSERT INTO ltw_workshop_drafts
        (draft_id, owner_id, request_id, title, language, created_at) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (owner_id, request_id) DO NOTHING RETURNING ${DRAFT_COLUMNS}`,
        [draftId, ownerId, input.requestId, input.title, input.language, now],
      );
      const row =
        result.rows[0] ??
        (
          await client.query<DraftRow>(
            `SELECT ${DRAFT_COLUMNS} FROM ltw_workshop_drafts WHERE owner_id = $1 AND request_id = $2`,
            [ownerId, input.requestId],
          )
        ).rows[0];
      if (!row) throw new Error('DRAFT_NOT_STORED');
      return row.title === input.title && row.language === input.language
        ? { kind: 'created', draft: draftView(row) }
        : { kind: 'conflict' };
    });
  }

  async draft(ownerId: string, draftId: string): Promise<WorkshopDraftView | null> {
    const result = await this.#read<DraftRow>(
      `SELECT ${DRAFT_COLUMNS} FROM ltw_workshop_drafts WHERE owner_id = $1 AND draft_id = $2`,
      [ownerId, draftId],
    );
    return result.rows[0] ? draftView(result.rows[0]) : null;
  }

  async drafts(
    ownerId: string,
    after: WorkshopDraftView | null,
    limit: number,
  ): Promise<readonly WorkshopDraftView[]> {
    const result = await this.#read<DraftRow>(
      `SELECT ${DRAFT_COLUMNS} FROM ltw_workshop_drafts
      WHERE owner_id = $1 AND ($2::timestamptz IS NULL OR (created_at, draft_id) < ($2, $3::uuid))
      ORDER BY created_at DESC, draft_id DESC LIMIT $4`,
      [ownerId, after?.createdAt ?? null, after?.draftId ?? null, limit],
    );
    return result.rows.map(draftView);
  }
}
