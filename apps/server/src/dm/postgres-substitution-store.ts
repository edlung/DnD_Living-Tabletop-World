import type pg from 'pg';

import type { SubstitutionReason } from '@ltw/contracts';

import {
  sameSubstitution,
  type RecordOutcome,
  type SubstitutionRecord,
  type SubstitutionStore,
} from './substitution-store.ts';

/**
 * PostgreSQL reasons (migration 0009_dm_substitutions.sql). Insert-only: the table refuses
 * updates, deletes and truncation. The primary key makes concurrent records of one command
 * ID settle on exactly one row; the loser is answered against it.
 */
interface Row {
  readonly campaign_id: string;
  readonly command_id: string;
  readonly character_id: string;
  readonly reason: SubstitutionReason;
  readonly note: string | null;
  readonly created_at: Date;
}

const COLUMNS = 'campaign_id, command_id, character_id, reason, note, created_at';

const toRecord = (row: Row): SubstitutionRecord => ({
  campaignId: row.campaign_id,
  commandId: row.command_id,
  characterId: row.character_id,
  reason: row.reason,
  note: row.note,
  createdAt: row.created_at.toISOString(),
});

export class PostgresSubstitutionStore implements SubstitutionStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async record(record: SubstitutionRecord): Promise<RecordOutcome> {
    const inserted = await this.#pool.query(
      `INSERT INTO ltw_dm_substitutions (${COLUMNS})
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (campaign_id, command_id) DO NOTHING`,
      [
        record.campaignId,
        record.commandId,
        record.characterId,
        record.reason,
        record.note,
        record.createdAt,
      ],
    );
    if (inserted.rowCount === 1) return 'recorded';
    const stored = await this.find(record.campaignId, record.commandId);
    if (!stored) throw new Error('a conflicting substitution record disappeared');
    return sameSubstitution(stored, record) ? 'duplicate' : 'conflict';
  }

  async find(campaignId: string, commandId: string): Promise<SubstitutionRecord | null> {
    const { rows } = await this.#pool.query<Row>(
      `SELECT ${COLUMNS} FROM ltw_dm_substitutions WHERE campaign_id = $1 AND command_id = $2`,
      [campaignId, commandId],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async forCommands(
    campaignId: string,
    commandIds: readonly string[],
  ): Promise<ReadonlyMap<string, SubstitutionRecord>> {
    if (commandIds.length === 0) return new Map();
    const { rows } = await this.#pool.query<Row>(
      `SELECT ${COLUMNS} FROM ltw_dm_substitutions
        WHERE campaign_id = $1 AND command_id = ANY($2::text[])`,
      [campaignId, [...commandIds]],
    );
    return new Map(rows.map((row) => [row.command_id, toRecord(row)]));
  }
}
