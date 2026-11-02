import type { TableDice, TableMode } from '@ltw/contracts';
import type pg from 'pg';

import { FRESH_TABLE, type TableState, type TableStateStore } from './table-state.ts';

/** The table's state on PostgreSQL (migrations 0029, 0031): one row per campaign, replaced whole. */
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
    }>('SELECT mode, paused, absent, dice FROM ltw_table_states WHERE campaign_id = $1', [
      campaignId,
    ]);
    const row = rows[0];
    return row
      ? { mode: row.mode, paused: row.paused, absent: row.absent, dice: row.dice }
      : FRESH_TABLE;
  }

  async write(campaignId: string, state: TableState, at: string): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_table_states (campaign_id, mode, paused, absent, dice, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (campaign_id) DO UPDATE
         SET mode = EXCLUDED.mode, paused = EXCLUDED.paused, absent = EXCLUDED.absent,
             dice = EXCLUDED.dice, updated_at = EXCLUDED.updated_at`,
      [campaignId, state.mode, state.paused, JSON.stringify(state.absent), state.dice, at],
    );
  }
}
