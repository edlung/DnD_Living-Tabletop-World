import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { InMemoryPlaceSoundStore, type PlaceSoundStore } from './place-sound-store.ts';
import { PostgresPlaceSoundStore } from './postgres-place-sound-store.ts';

/**
 * Places' own sounds on PostgreSQL (migration 0046, Stage 850), held to the in-memory store's
 * semantics: one a place, replaced on save, removed when it brings nothing.
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
const TRACK = '00000000-0000-4000-8000-000000000001';
const AT = '2026-11-16T18:00:00.000Z';

async function story(store: PlaceSoundStore) {
  await store.put(C, { locationId: 'market-square', ambience: 'crowd', trackId: null }, AT);
  await store.put(C, { locationId: 'north-gate', ambience: null, trackId: TRACK }, AT);
  await store.put(C, { locationId: 'market-square', ambience: 'rain', trackId: TRACK }, AT);
  await store.put('other-table', { locationId: 'market-square', ambience: 'fire', trackId: null }, AT);
  const list = await store.list(C);
  const one = await store.get(C, 'north-gate');
  await store.put(C, { locationId: 'north-gate', ambience: null, trackId: null }, AT);
  return {
    list,
    one,
    after: await store.list(C),
    none: await store.get(C, 'north-gate'),
    other: await store.list('other-table'),
  };
}

describe('places’ sounds on PostgreSQL', () => {
  it('behave as the in-memory store does', async () => {
    const expected = await story(new InMemoryPlaceSoundStore());
    const actual = await story(new PostgresPlaceSoundStore(pool));
    expect(actual).toEqual(expected);
    expect(actual.list).toEqual([
      { locationId: 'market-square', ambience: 'rain', trackId: TRACK },
      { locationId: 'north-gate', ambience: null, trackId: TRACK },
    ]);
    expect(actual.after.map((sound) => sound.locationId)).toEqual(['market-square']);
    expect(actual.none).toBeNull();
    expect(actual.other).toHaveLength(1);
  });

  it('refuse a row that brings nothing', async () => {
    await expect(
      pool.query(
        `INSERT INTO ltw_place_sounds (campaign_id, location_id, ambience, track_id, updated_at)
         VALUES ('ravenford', 'market-square', NULL, NULL, now())`,
      ),
    ).rejects.toThrow();
  });
});
