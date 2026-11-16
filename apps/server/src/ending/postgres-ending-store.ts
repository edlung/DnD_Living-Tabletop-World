import { KEEPSAKE_KINDS } from '@ltw/contracts';
import type pg from 'pg';

import type { EndingRecord, EndingStore, KeepsakeRecord } from './ending-store.ts';

/** A campaign's end and keepsakes on PostgreSQL (migration 0043_campaign_endings.sql). */
interface EndRow {
  readonly campaign_id: string;
  readonly finished_at: Date;
  readonly line: string;
}

interface KeptRow {
  readonly campaign_id: string;
  readonly character_id: string;
  readonly kind: string;
  readonly ref_id: string;
  readonly label: string;
  readonly line: string;
  readonly kept_at: Date;
}

export class PostgresEndingStore implements EndingStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async read(campaignId: string): Promise<EndingRecord | null> {
    const { rows } = await this.#pool.query<EndRow>(
      'SELECT campaign_id, finished_at, line FROM ltw_campaign_endings WHERE campaign_id = $1',
      [campaignId],
    );
    const row = rows[0];
    return row
      ? { campaignId: row.campaign_id, finishedAt: row.finished_at.toISOString(), line: row.line }
      : null;
  }

  async finish(record: EndingRecord): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_campaign_endings (campaign_id, finished_at, line) VALUES ($1, $2, $3)
       ON CONFLICT (campaign_id) DO UPDATE SET
         finished_at = EXCLUDED.finished_at, line = EXCLUDED.line`,
      [record.campaignId, record.finishedAt, record.line],
    );
  }

  async reopen(campaignId: string): Promise<void> {
    await this.#pool.query('DELETE FROM ltw_campaign_endings WHERE campaign_id = $1', [campaignId]);
  }

  async keepsakes(campaignId: string): Promise<readonly KeepsakeRecord[]> {
    const { rows } = await this.#pool.query<KeptRow>(
      `SELECT campaign_id, character_id, kind, ref_id, label, line, kept_at
         FROM ltw_keepsakes WHERE campaign_id = $1 ORDER BY character_id COLLATE "C"`,
      [campaignId],
    );
    return rows.map((row) => ({
      campaignId: row.campaign_id,
      characterId: row.character_id,
      // A kind a later build wrote is read as a thing carried.
      kind: KEEPSAKE_KINDS.find((kind) => kind === row.kind) ?? 'item',
      refId: row.ref_id,
      label: row.label,
      line: row.line,
      keptAt: row.kept_at.toISOString(),
    }));
  }

  async keep(record: KeepsakeRecord): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_keepsakes (campaign_id, character_id, kind, ref_id, label, line, kept_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (campaign_id, character_id) DO UPDATE SET
         kind = EXCLUDED.kind, ref_id = EXCLUDED.ref_id, label = EXCLUDED.label,
         line = EXCLUDED.line, kept_at = EXCLUDED.kept_at`,
      [
        record.campaignId,
        record.characterId,
        record.kind,
        record.refId,
        record.label,
        record.line,
        record.keptAt,
      ],
    );
  }

  async drop(campaignId: string, characterId: string): Promise<void> {
    await this.#pool.query(
      'DELETE FROM ltw_keepsakes WHERE campaign_id = $1 AND character_id = $2',
      [campaignId, characterId],
    );
  }
}
