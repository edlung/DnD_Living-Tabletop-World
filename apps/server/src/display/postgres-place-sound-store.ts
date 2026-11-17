import { MAX_PLACE_SOUNDS, ambienceChoiceSchema, type PlaceSound } from '@ltw/contracts';
import type pg from 'pg';

import type { PlaceSoundStore } from './place-sound-store.ts';

/** Places' own sounds on PostgreSQL (migration 0046_place_sounds.sql). */
interface PlaceSoundRow {
  readonly location_id: string;
  readonly ambience: string | null;
  readonly track_id: string | null;
}

const soundOf = (row: PlaceSoundRow): PlaceSound => ({
  locationId: row.location_id,
  ambience: row.ambience === null ? null : ambienceChoiceSchema.parse(row.ambience),
  trackId: row.track_id,
});

export class PostgresPlaceSoundStore implements PlaceSoundStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async list(campaignId: string): Promise<readonly PlaceSound[]> {
    const { rows } = await this.#pool.query<PlaceSoundRow>(
      `SELECT location_id, ambience, track_id FROM ltw_place_sounds
        WHERE campaign_id = $1 ORDER BY location_id`,
      [campaignId],
    );
    return rows.map(soundOf);
  }

  async get(campaignId: string, locationId: string): Promise<PlaceSound | null> {
    const { rows } = await this.#pool.query<PlaceSoundRow>(
      `SELECT location_id, ambience, track_id FROM ltw_place_sounds
        WHERE campaign_id = $1 AND location_id = $2`,
      [campaignId, locationId],
    );
    return rows[0] ? soundOf(rows[0]) : null;
  }

  async put(campaignId: string, sound: PlaceSound, at: string): Promise<boolean> {
    if (sound.ambience === null && sound.trackId === null) {
      await this.#pool.query(
        `DELETE FROM ltw_place_sounds WHERE campaign_id = $1 AND location_id = $2`,
        [campaignId, sound.locationId],
      );
      return true;
    }
    // One statement: a place that has a sound is changed; a new one is taken while there is room.
    const { rowCount } = await this.#pool.query(
      `INSERT INTO ltw_place_sounds (campaign_id, location_id, ambience, track_id, updated_at)
       SELECT $1, $2, $3, $4, $5
        WHERE EXISTS (SELECT 1 FROM ltw_place_sounds
                       WHERE campaign_id = $1 AND location_id = $2)
           OR (SELECT count(*) FROM ltw_place_sounds WHERE campaign_id = $1) < $6
       ON CONFLICT (campaign_id, location_id)
       DO UPDATE SET ambience = EXCLUDED.ambience, track_id = EXCLUDED.track_id,
                     updated_at = EXCLUDED.updated_at`,
      [campaignId, sound.locationId, sound.ambience, sound.trackId, at, MAX_PLACE_SOUNDS],
    );
    return (rowCount ?? 0) > 0;
  }
}
