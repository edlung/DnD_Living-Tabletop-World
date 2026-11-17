import type pg from 'pg';

import type { ReflectionRecord, ReflectionStore } from './reflection-store.ts';

/** Stars and wishes on PostgreSQL (migration 0040_session_reflections.sql). */
interface ReflectionRow {
  readonly campaign_id: string;
  readonly session_id: string;
  readonly author_id: string;
  readonly star: string;
  readonly wish: string;
  readonly written_at: Date;
  readonly updated_at: Date;
}

/** The DM's own entry has no character: the column holds the empty string for it. */
const DM = '';

export class PostgresReflectionStore implements ReflectionStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async put(record: Omit<ReflectionRecord, 'writtenAt'>): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_session_reflections
         (campaign_id, session_id, author_id, star, wish, written_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (campaign_id, session_id, author_id)
       DO UPDATE SET star = EXCLUDED.star, wish = EXCLUDED.wish, updated_at = EXCLUDED.updated_at`,
      [
        record.campaignId,
        record.sessionId,
        record.authorId ?? DM,
        record.star,
        record.wish,
        record.updatedAt,
      ],
    );
  }

  async remove(campaignId: string, sessionId: string, authorId: string | null): Promise<void> {
    await this.#pool.query(
      `DELETE FROM ltw_session_reflections
        WHERE campaign_id = $1 AND session_id = $2 AND author_id = $3`,
      [campaignId, sessionId, authorId ?? DM],
    );
  }

  async ofCampaign(campaignId: string): Promise<readonly ReflectionRecord[]> {
    const { rows } = await this.#pool.query<ReflectionRow>(
      `SELECT campaign_id, session_id, author_id, star, wish, written_at, updated_at
         FROM ltw_session_reflections WHERE campaign_id = $1
        ORDER BY written_at, author_id`,
      [campaignId],
    );
    return rows.map((row) => ({
      campaignId: row.campaign_id,
      sessionId: row.session_id,
      authorId: row.author_id === DM ? null : row.author_id,
      star: row.star,
      wish: row.wish,
      writtenAt: row.written_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }
}
