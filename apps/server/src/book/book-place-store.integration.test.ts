import type { BookPlace } from '@ltw/contracts';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { InMemoryBookPlaceStore, type BookPlaceStore } from './book-place-store.ts';
import { PostgresBookPlaceStore } from './postgres-book-place-store.ts';

/**
 * The DM's place in the book on PostgreSQL (migration 0049, Stage 920), held to the in-memory
 * store's semantics: one place a campaign, the last write kept, an unread book's place empty.
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

const NOW = '2026-11-22T18:00:00.000Z';
const FIRST: BookPlace = {
  ribbon: 'home-scene-1',
  played: [],
  notes: { home: 'Спросить про билет' },
};
const LATER: BookPlace = { ribbon: 'isle', played: ['home'], notes: {} };

async function life(store: BookPlaceStore) {
  const seen: BookPlace[] = [];
  seen.push(await store.read('lighthouse'));
  await store.write('lighthouse', FIRST, NOW);
  await store.write('other', LATER, NOW);
  seen.push(await store.read('lighthouse'), await store.read('other'));
  await store.write('lighthouse', LATER, NOW);
  seen.push(await store.read('lighthouse'));
  return seen;
}

describe('the DM’s place in the book, stored', () => {
  it('behaves on PostgreSQL as it does in memory', async () => {
    const expected = [{ ribbon: null, played: [], notes: {} }, FIRST, LATER, LATER];
    expect(await life(new InMemoryBookPlaceStore())).toEqual(expected);
    expect(await life(new PostgresBookPlaceStore(pool))).toEqual(expected);
  });

  it('reads a row it cannot understand as an unread book, and refuses a campaign ID that is not one', async () => {
    await pool.query(
      `INSERT INTO ltw_dm_book_places (campaign_id, place, updated_at) VALUES ($1, $2::jsonb, $3)`,
      ['lighthouse', JSON.stringify({ ribbon: 7 }), NOW],
    );
    const store = new PostgresBookPlaceStore(pool);
    expect(await store.read('lighthouse')).toEqual({ ribbon: null, played: [], notes: {} });
    await expect(store.write('Not A Campaign', FIRST, NOW)).rejects.toThrow();
  });
});
