import type { ComingAnswer } from '@ltw/contracts';
import type pg from 'pg';

import type { ComingStore } from './coming-store.ts';

/** Who comes to the next game, on PostgreSQL (migration 0048): one row a character. */
export class PostgresComingStore implements ComingStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async read(campaignId: string, gameAt: string): Promise<ReadonlyMap<string, ComingAnswer>> {
    const { rows } = await this.#pool.query<{ character_id: string; coming: ComingAnswer }>(
      `SELECT character_id, coming FROM ltw_next_game_answers
        WHERE campaign_id = $1 AND game_at = $2
        ORDER BY character_id`,
      [campaignId, gameAt],
    );
    return new Map(rows.map((row) => [row.character_id, row.coming]));
  }

  async set(
    campaignId: string,
    characterId: string,
    gameAt: string,
    coming: ComingAnswer | null,
    at: string,
  ): Promise<void> {
    if (coming === null) {
      await this.#pool.query(
        `DELETE FROM ltw_next_game_answers WHERE campaign_id = $1 AND character_id = $2`,
        [campaignId, characterId],
      );
      return;
    }
    await this.#pool.query(
      `INSERT INTO ltw_next_game_answers (campaign_id, character_id, game_at, coming, answered_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (campaign_id, character_id)
       DO UPDATE SET game_at = EXCLUDED.game_at, coming = EXCLUDED.coming,
                     answered_at = EXCLUDED.answered_at`,
      [campaignId, characterId, gameAt, coming, at],
    );
  }

  async clear(campaignId: string): Promise<void> {
    await this.#pool.query(`DELETE FROM ltw_next_game_answers WHERE campaign_id = $1`, [
      campaignId,
    ]);
  }
}
