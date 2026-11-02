import type pg from 'pg';

import type { HandoutRecord, HandoutStore } from './handout-store.ts';

/** Handouts on PostgreSQL (migration 0032): insert-only; the latest read back oldest first. */
interface HandoutRow {
  readonly campaign_id: string;
  readonly handout_id: string;
  readonly recipient_id: string | null;
  readonly title: string;
  readonly body: string | null;
  readonly entity_id: string | null;
  readonly created_at: Date;
}

const COLUMNS = 'campaign_id, handout_id, recipient_id, title, body, entity_id, created_at';

export class PostgresHandoutStore implements HandoutStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async add(record: HandoutRecord): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_handouts (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        record.campaignId,
        record.handoutId,
        record.recipientId,
        record.title,
        record.text,
        record.entityId,
        record.at,
      ],
    );
  }

  async recent(campaignId: string, limit: number): Promise<readonly HandoutRecord[]> {
    const { rows } = await this.#pool.query<HandoutRow>(
      `SELECT ${COLUMNS} FROM ltw_handouts WHERE campaign_id = $1 ORDER BY position DESC LIMIT $2`,
      [campaignId, limit],
    );
    return rows
      .map((row) => ({
        campaignId: row.campaign_id,
        handoutId: row.handout_id,
        recipientId: row.recipient_id,
        title: row.title,
        text: row.body,
        entityId: row.entity_id,
        at: row.created_at.toISOString(),
      }))
      .reverse();
  }
}
