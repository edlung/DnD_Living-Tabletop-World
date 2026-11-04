import { MAX_MARKS, type MarkKind, type Square } from '@ltw/contracts';
import type pg from 'pg';

import type { MarkRecord, MarkStore } from './mark-store.ts';

/**
 * The table's marks on PostgreSQL (migration 0035_table_marks.sql). A mark is written under a
 * per-campaign advisory lock, so the pointer stays one and the limit holds against two screens at
 * once; expired pings are left out on reading and swept as new marks are laid.
 */
interface MarkRow {
  readonly campaign_id: string;
  readonly fight_id: string;
  readonly mark_id: string;
  readonly author_id: string;
  readonly by_dm: boolean;
  readonly kind: MarkKind;
  readonly body: { readonly square?: Square; readonly squares?: readonly Square[] };
  readonly created_at: Date;
  readonly expires_at: Date | null;
}

const COLUMNS =
  'campaign_id, fight_id, mark_id, author_id, by_dm, kind, body, created_at, expires_at';

const toRecord = (row: MarkRow): MarkRecord => ({
  campaignId: row.campaign_id,
  fightId: row.fight_id,
  markId: row.mark_id,
  authorId: row.author_id,
  byDm: row.by_dm,
  kind: row.kind,
  ...(row.body.square ? { square: row.body.square } : {}),
  ...(row.body.squares ? { squares: row.body.squares } : {}),
  createdAt: row.created_at.toISOString(),
  expiresAt: row.expires_at === null ? null : row.expires_at.toISOString(),
});

export class PostgresMarkStore implements MarkStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async list(campaignId: string, fightId: string, now: string): Promise<readonly MarkRecord[]> {
    const { rows } = await this.#pool.query<MarkRow>(
      `SELECT ${COLUMNS} FROM ltw_table_marks
        WHERE campaign_id = $1 AND fight_id = $2 AND (expires_at IS NULL OR expires_at > $3)
        ORDER BY created_at, mark_id`,
      [campaignId, fightId, now],
    );
    return rows.map(toRecord);
  }

  async add(record: MarkRecord): Promise<boolean> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('ltw_table_marks:' || $1))`, [
        record.campaignId,
      ]);
      const taken = await client.query(
        'SELECT 1 FROM ltw_table_marks WHERE campaign_id = $1 AND mark_id = $2',
        [record.campaignId, record.markId],
      );
      if ((taken.rowCount ?? 0) > 0) {
        await client.query('ROLLBACK');
        return false;
      }
      // Another fight's marks and expired pings go; the pointer is one.
      await client.query(
        `DELETE FROM ltw_table_marks
          WHERE campaign_id = $1
            AND (fight_id <> $2 OR expires_at <= $3 OR ($4 AND kind = 'pointer'))`,
        [record.campaignId, record.fightId, record.createdAt, record.kind === 'pointer'],
      );
      await client.query(
        `INSERT INTO ltw_table_marks
           (campaign_id, fight_id, mark_id, author_id, by_dm, kind, body, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          record.campaignId,
          record.fightId,
          record.markId,
          record.authorId,
          record.byDm,
          record.kind,
          JSON.stringify({
            ...(record.square ? { square: record.square } : {}),
            ...(record.squares ? { squares: record.squares } : {}),
          }),
          record.createdAt,
          record.expiresAt,
        ],
      );
      // Past the limit the oldest marks give way.
      await client.query(
        `DELETE FROM ltw_table_marks
          WHERE campaign_id = $1 AND mark_id IN (
            SELECT mark_id FROM ltw_table_marks WHERE campaign_id = $1
             ORDER BY created_at DESC, mark_id DESC OFFSET $2)`,
        [record.campaignId, MAX_MARKS],
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

  async remove(campaignId: string, markId: string): Promise<MarkRecord | null> {
    const { rows } = await this.#pool.query<MarkRow>(
      `DELETE FROM ltw_table_marks WHERE campaign_id = $1 AND mark_id = $2 RETURNING ${COLUMNS}`,
      [campaignId, markId],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async clear(campaignId: string): Promise<number> {
    const { rowCount } = await this.#pool.query(
      'DELETE FROM ltw_table_marks WHERE campaign_id = $1',
      [campaignId],
    );
    return rowCount ?? 0;
  }

  async playersMayMark(campaignId: string): Promise<boolean> {
    const { rows } = await this.#pool.query<{ players_may_mark: boolean }>(
      'SELECT players_may_mark FROM ltw_table_mark_settings WHERE campaign_id = $1',
      [campaignId],
    );
    return rows[0]?.players_may_mark ?? false;
  }

  async setPlayersMayMark(campaignId: string, allowed: boolean): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_table_mark_settings (campaign_id, players_may_mark) VALUES ($1, $2)
       ON CONFLICT (campaign_id) DO UPDATE SET players_may_mark = EXCLUDED.players_may_mark`,
      [campaignId, allowed],
    );
  }
}
