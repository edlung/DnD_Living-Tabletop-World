import {
  FRESH_SOUND,
  ambienceChoiceSchema,
  musicPlayingSchema,
  type TableDice,
  type TableMode,
  type TableSound,
} from '@ltw/contracts';
import type pg from 'pg';

import { FRESH_TABLE, type TableState, type TableStateStore } from './table-state.ts';

/**
 * The table's state on PostgreSQL (migrations 0029, 0031, 0037): one row per campaign, replaced
 * whole. A row written before 0037 has no sound, and one before 690c no music: each reads as a
 * fresh table's.
 */
const soundOf = (value: unknown): TableSound => {
  const sound =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const ambience = ambienceChoiceSchema.safeParse(sound['ambience']);
  const music = musicPlayingSchema.safeParse(sound['music']);
  return {
    ambience: ambience.success ? ambience.data : FRESH_SOUND.ambience,
    music: music.success ? music.data : null,
  };
};

export class PostgresTableStateStore implements TableStateStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async read(campaignId: string): Promise<TableState> {
    const { rows } = await this.#pool.query<{
      mode: TableMode;
      paused: boolean;
      absent: string[];
      dice: TableDice;
      sound: unknown;
    }>('SELECT mode, paused, absent, dice, sound FROM ltw_table_states WHERE campaign_id = $1', [
      campaignId,
    ]);
    const row = rows[0];
    return row
      ? {
          mode: row.mode,
          paused: row.paused,
          absent: row.absent,
          dice: row.dice,
          sound: soundOf(row.sound),
        }
      : FRESH_TABLE;
  }

  async write(campaignId: string, state: TableState, at: string): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_table_states (campaign_id, mode, paused, absent, dice, sound, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (campaign_id) DO UPDATE
         SET mode = EXCLUDED.mode, paused = EXCLUDED.paused, absent = EXCLUDED.absent,
             dice = EXCLUDED.dice, sound = EXCLUDED.sound, updated_at = EXCLUDED.updated_at`,
      [
        campaignId,
        state.mode,
        state.paused,
        JSON.stringify(state.absent),
        state.dice,
        JSON.stringify(state.sound),
        at,
      ],
    );
  }
}
