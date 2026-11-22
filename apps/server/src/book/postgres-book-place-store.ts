import { EMPTY_BOOK_PLACE, bookPlaceSchema, type BookPlace } from '@ltw/contracts';
import type pg from 'pg';

import type { BookPlaceStore } from './book-place-store.ts';

/** The DM's place in the book on PostgreSQL (migration 0049): one row a campaign. */
export class PostgresBookPlaceStore implements BookPlaceStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async read(campaignId: string): Promise<BookPlace> {
    const { rows } = await this.#pool.query<{ place: unknown }>(
      `SELECT place FROM ltw_dm_book_places WHERE campaign_id = $1`,
      [campaignId],
    );
    const stored = bookPlaceSchema.safeParse(rows[0]?.place);
    return stored.success ? stored.data : EMPTY_BOOK_PLACE;
  }

  async write(campaignId: string, place: BookPlace, at: string): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_dm_book_places (campaign_id, place, updated_at)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (campaign_id)
       DO UPDATE SET place = EXCLUDED.place, updated_at = EXCLUDED.updated_at`,
      [campaignId, JSON.stringify(place), at],
    );
  }
}
