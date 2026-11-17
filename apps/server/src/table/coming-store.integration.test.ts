import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { InMemoryComingStore, type ComingStore } from './coming-store.ts';
import { PostgresComingStore } from './postgres-coming-store.ts';

/**
 * Who comes to the next game, on PostgreSQL (migration 0048, Stage 890), held to the in-memory
 * store's semantics: one answer a character, read only for the date it was given for.
 */
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

const C = 'ravenford';
const SATURDAY = '2026-11-21T15:00:00.000Z';
const SUNDAY = '2026-11-22T15:00:00.000Z';
const NOW = '2026-11-16T18:00:00.000Z';

async function life(store: ComingStore) {
  const seen: unknown[] = [];
  const read = async (campaignId: string, at: string) =>
    [...(await store.read(campaignId, at))].sort(([a], [b]) => a.localeCompare(b));
  await store.set(C, 'elowen', SATURDAY, 'yes', NOW);
  await store.set(C, 'brann', SATURDAY, 'no', NOW);
  await store.set('other', 'elowen', SATURDAY, 'no', NOW);
  seen.push(await read(C, SATURDAY));
  // The same instant written another way is the same date.
  seen.push(await read(C, '2026-11-21T16:00:00+01:00'));
  // Another date reads none of them.
  seen.push(await read(C, SUNDAY));
  // An answer replaces the earlier one, and moves to the date it is given for.
  await store.set(C, 'elowen', SATURDAY, 'no', NOW);
  await store.set(C, 'brann', SUNDAY, 'yes', NOW);
  seen.push(await read(C, SATURDAY), await read(C, SUNDAY));
  // Taken back; taking back what was never said changes nothing.
  await store.set(C, 'elowen', SATURDAY, null, NOW);
  await store.set(C, 'thorn', SATURDAY, null, NOW);
  seen.push(await read(C, SATURDAY));
  // A campaign's answers are forgotten together, and only its own.
  await store.clear(C);
  seen.push(await read(C, SUNDAY), await read('other', SATURDAY));
  return seen;
}

describe('the PostgreSQL store of who comes', () => {
  it('keeps what the in-memory store keeps', async () => {
    const expected = await life(new InMemoryComingStore());
    expect(await life(new PostgresComingStore(pool))).toEqual(expected);
    expect(expected[0]).toEqual([
      ['brann', 'no'],
      ['elowen', 'yes'],
    ]);
    expect(expected[2]).toEqual([]);
    expect(expected.at(-1)).toEqual([['elowen', 'no']]);
  });

  it('refuses an answer that is neither', async () => {
    await expect(
      pool.query(
        `INSERT INTO ltw_next_game_answers (campaign_id, character_id, game_at, coming, answered_at)
         VALUES ('ravenford', 'elowen', now(), 'maybe', now())`,
      ),
    ).rejects.toThrow();
  });
});
