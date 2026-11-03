import { MAX_SAVED_ENCOUNTERS, savedEncounterRequestSchema } from '@ltw/contracts';
import type pg from 'pg';

import type { SavedEncounterRecord, SavedEncounterStore } from './saved-encounter-store.ts';

/**
 * The DM's saved encounters on PostgreSQL (migration 0034_saved_encounters.sql). A new encounter
 * is written under a per-campaign advisory lock, so two tabs cannot pass the campaign's limit
 * together; the body is read back through its schema.
 */
interface EncounterRow {
  readonly campaign_id: string;
  readonly encounter_id: string;
  readonly body: unknown;
  readonly updated_at: Date;
}

const toRecord = (row: EncounterRow): SavedEncounterRecord => ({
  campaignId: row.campaign_id,
  encounterId: row.encounter_id,
  encounter: savedEncounterRequestSchema.parse(row.body),
  updatedAt: row.updated_at.toISOString(),
});

export class PostgresSavedEncounterStore implements SavedEncounterStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async list(campaignId: string): Promise<readonly SavedEncounterRecord[]> {
    const { rows } = await this.#pool.query<EncounterRow>(
      `SELECT campaign_id, encounter_id, body, updated_at FROM ltw_saved_encounters
        WHERE campaign_id = $1 ORDER BY updated_at DESC`,
      [campaignId],
    );
    return rows.map(toRecord);
  }

  async get(campaignId: string, encounterId: string): Promise<SavedEncounterRecord | null> {
    const { rows } = await this.#pool.query<EncounterRow>(
      `SELECT campaign_id, encounter_id, body, updated_at FROM ltw_saved_encounters
        WHERE campaign_id = $1 AND encounter_id = $2`,
      [campaignId, encounterId],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async put(record: SavedEncounterRecord): Promise<boolean> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('ltw_saved_encounters:' || $1))`, [
        record.campaignId,
      ]);
      const { rows } = await client.query<{ count: string; known: boolean }>(
        `SELECT count(*) AS count,
                bool_or(encounter_id = $2) AS known
           FROM ltw_saved_encounters WHERE campaign_id = $1`,
        [record.campaignId, record.encounterId],
      );
      const known = rows[0]?.known === true;
      if (!known && Number(rows[0]?.count ?? 0) >= MAX_SAVED_ENCOUNTERS) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(
        `INSERT INTO ltw_saved_encounters (campaign_id, encounter_id, body, updated_at)
           VALUES ($1, $2, $3, $4)
         ON CONFLICT (campaign_id, encounter_id)
           DO UPDATE SET body = EXCLUDED.body, updated_at = EXCLUDED.updated_at`,
        [record.campaignId, record.encounterId, JSON.stringify(record.encounter), record.updatedAt],
      );
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(campaignId: string, encounterId: string): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      'DELETE FROM ltw_saved_encounters WHERE campaign_id = $1 AND encounter_id = $2',
      [campaignId, encounterId],
    );
    return (rowCount ?? 0) > 0;
  }
}
