import { keptHandoutSchema, randomTableSchema } from '@ltw/contracts';
import type pg from 'pg';

import {
  LIBRARY_LIMITS,
  type LibraryKind,
  type LibraryPut,
  type LibraryRecord,
  type LibraryStore,
} from './library-store.ts';

/**
 * The DM's library on PostgreSQL (migration 0036_dm_library.sql). A new entry is written under a
 * per-campaign advisory lock, so two tabs cannot pass the campaign's limit together; the body is
 * read back through its schema.
 */
interface LibraryRow {
  readonly campaign_id: string;
  readonly entry_id: string;
  readonly kind: LibraryKind;
  readonly body: unknown;
  readonly updated_at: Date;
  readonly given_at: Date | null;
}

const COLUMNS = 'campaign_id, entry_id, kind, body, updated_at, given_at';

function toRecord(row: LibraryRow): LibraryRecord {
  const base = {
    campaignId: row.campaign_id,
    entryId: row.entry_id,
    updatedAt: row.updated_at.toISOString(),
  };
  return row.kind === 'handout'
    ? {
        ...base,
        kind: 'handout',
        body: keptHandoutSchema.parse(row.body),
        givenAt: row.given_at?.toISOString() ?? null,
      }
    : { ...base, kind: 'table', body: randomTableSchema.parse(row.body), givenAt: null };
}

export class PostgresLibraryStore implements LibraryStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async list(campaignId: string): Promise<readonly LibraryRecord[]> {
    const { rows } = await this.#pool.query<LibraryRow>(
      `SELECT ${COLUMNS} FROM ltw_dm_library WHERE campaign_id = $1 ORDER BY updated_at DESC`,
      [campaignId],
    );
    return rows.map(toRecord);
  }

  async get(campaignId: string, entryId: string): Promise<LibraryRecord | null> {
    const { rows } = await this.#pool.query<LibraryRow>(
      `SELECT ${COLUMNS} FROM ltw_dm_library WHERE campaign_id = $1 AND entry_id = $2`,
      [campaignId, entryId],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async put(record: LibraryRecord): Promise<LibraryPut> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('ltw_dm_library:' || $1))`, [
        record.campaignId,
      ]);
      const { rows } = await client.query<{ count: string; known: LibraryKind | null }>(
        `SELECT count(*) FILTER (WHERE kind = $3) AS count,
                max(kind) FILTER (WHERE entry_id = $2) AS known
           FROM ltw_dm_library WHERE campaign_id = $1`,
        [record.campaignId, record.entryId, record.kind],
      );
      const known = rows[0]?.known ?? null;
      const outcome: LibraryPut | null =
        known !== null && known !== record.kind
          ? 'kind'
          : known === null && Number(rows[0]?.count ?? 0) >= LIBRARY_LIMITS[record.kind]
            ? 'limit'
            : null;
      if (outcome !== null) {
        await client.query('ROLLBACK');
        return outcome;
      }
      await client.query(
        `INSERT INTO ltw_dm_library (campaign_id, entry_id, kind, body, updated_at)
           VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (campaign_id, entry_id)
           DO UPDATE SET body = EXCLUDED.body, updated_at = EXCLUDED.updated_at`,
        [
          record.campaignId,
          record.entryId,
          record.kind,
          JSON.stringify(record.body),
          record.updatedAt,
        ],
      );
      await client.query('COMMIT');
      return 'written';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(campaignId: string, entryId: string, kind: LibraryKind): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      'DELETE FROM ltw_dm_library WHERE campaign_id = $1 AND entry_id = $2 AND kind = $3',
      [campaignId, entryId, kind],
    );
    return (rowCount ?? 0) > 0;
  }

  async given(campaignId: string, entryId: string, at: string): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      `UPDATE ltw_dm_library SET given_at = $3
        WHERE campaign_id = $1 AND entry_id = $2 AND kind = 'handout'`,
      [campaignId, entryId, at],
    );
    return (rowCount ?? 0) > 0;
  }
}
