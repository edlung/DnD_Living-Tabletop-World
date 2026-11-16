import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresTableStateStore } from './postgres-table-state-store.ts';
import { FRESH_TABLE } from './table-state.ts';

/** The table's state on PostgreSQL (migration 0029, Stage 620): one row per campaign, replaced. */
let database: ThrowawayDatabase;
let pool: pg.Pool;

beforeEach(async () => {
  database = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: database.url });
});

afterEach(async () => {
  await pool.end();
  await database.drop();
});

describe('PostgresTableStateStore', () => {
  it('reads a fresh table, then what was written last, per campaign', async () => {
    const store = new PostgresTableStateStore(pool);
    expect(await store.read('ravenford')).toEqual(FRESH_TABLE);
    await store.write(
      'ravenford',
      {
        mode: 'online',
        paused: true,
        absent: ['brann-ironvale'],
        dice: 'physical',
        sound: { ambience: 'rain', music: null },
        nextGame: { at: '2026-11-21T16:00:00.000Z', note: 'At Grandma’s' },
      },
      '2026-11-02T10:00:00.000Z',
    );
    await store.write(
      'ravenford',
      {
        mode: 'online',
        paused: false,
        absent: ['brann-ironvale', 'maren-ashby'],
        dice: 'app',
        sound: {
          ambience: 'none',
          music: {
            trackId: '3f1d6a2e-9c4b-4e1a-8f3d-2b7c9e5a1d40',
            repeat: true,
            startedAt: null,
            pausedAt: 42.5,
          },
        },
        nextGame: { at: '2026-11-28T16:30:00.000Z', note: '' },
      },
      '2026-11-02T10:05:00.000Z',
    );
    expect(await store.read('ravenford')).toEqual({
      mode: 'online',
      paused: false,
      absent: ['brann-ironvale', 'maren-ashby'],
      dice: 'app',
      // The table's sound (migration 0037): the ambience the DM chose, the track paused where it was.
      sound: {
        ambience: 'none',
        music: {
          trackId: '3f1d6a2e-9c4b-4e1a-8f3d-2b7c9e5a1d40',
          repeat: true,
          startedAt: null,
          pausedAt: 42.5,
        },
      },
      // The next game (migration 0041): the date written last, and its line.
      nextGame: { at: '2026-11-28T16:30:00.000Z', note: '' },
    });
    // An older build writes the row without the date's columns: the date stays as it was.
    await pool.query(
      `UPDATE ltw_table_states SET mode = 'table', updated_at = '2026-11-02T10:06:00.000Z'
        WHERE campaign_id = 'ravenford'`,
    );
    expect((await store.read('ravenford')).nextGame).toEqual({
      at: '2026-11-28T16:30:00.000Z',
      note: '',
    });
    await store.write('ravenford', { ...FRESH_TABLE, nextGame: null }, '2026-11-02T10:07:00.000Z');
    expect((await store.read('ravenford')).nextGame).toBeNull();
    expect(await store.read('other-table')).toEqual(FRESH_TABLE);
  });
});
