import { randomUUID } from 'node:crypto';

import { MAX_SAVED_ENCOUNTERS, type SavedEncounterRequest } from '@ltw/contracts';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresSavedEncounterStore } from './postgres-saved-encounter-store.ts';
import {
  InMemorySavedEncounterStore,
  type SavedEncounterRecord,
  type SavedEncounterStore,
} from './saved-encounter-store.ts';

/**
 * The DM's saved encounters on PostgreSQL (migration 0034, Stage 670a), held to the in-memory
 * store's semantics: per campaign, newest change first, changed in place, a deleted one gone, and
 * no new one past the campaign's limit — not even two written at once.
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

const encounter = (name: string): SavedEncounterRequest => ({
  name,
  locationId: 'old-trade-road',
  battlefield: { width: 16, height: 12, difficult: [], cover: [] },
  foes: [{ kind: 'bestiary', monsterId: 'goblin-warrior', position: { x: 15, y: 0 } }],
  partyStart: [{ x: 0, y: 1 }],
});

const record = (campaignId: string, name: string, at: string): SavedEncounterRecord => ({
  campaignId,
  encounterId: randomUUID(),
  encounter: encounter(name),
  updatedAt: at,
});

async function keepsAndForgets(store: SavedEncounterStore) {
  const ford = record('ravenford', 'Goblins at the ford', '2026-11-03T10:00:00.000Z');
  const crypt = record('ravenford', 'The crypt', '2026-11-03T10:05:00.000Z');
  expect(await store.put(ford)).toBe(true);
  expect(await store.put(crypt)).toBe(true);
  expect(await store.put(record('other-table', 'Elsewhere', '2026-11-03T10:06:00.000Z'))).toBe(
    true,
  );
  expect((await store.list('ravenford')).map((one) => one.encounter.name)).toEqual([
    'The crypt',
    'Goblins at the ford',
  ]);
  // Changed in place: the same id, its new body, now the newest.
  expect(
    await store.put({
      ...ford,
      encounter: encounter('Goblins at the old ford'),
      updatedAt: '2026-11-03T10:10:00.000Z',
    }),
  ).toBe(true);
  expect((await store.list('ravenford')).map((one) => one.encounter.name)).toEqual([
    'Goblins at the old ford',
    'The crypt',
  ]);
  expect((await store.get('ravenford', ford.encounterId))?.encounter.name).toBe(
    'Goblins at the old ford',
  );
  // Another campaign's encounter is not this campaign's to read or delete.
  expect(await store.get('other-table', ford.encounterId)).toBeNull();
  expect(await store.delete('other-table', ford.encounterId)).toBe(false);
  expect(await store.delete('ravenford', crypt.encounterId)).toBe(true);
  expect(await store.delete('ravenford', crypt.encounterId)).toBe(false);
  expect((await store.list('ravenford')).map((one) => one.encounter.name)).toEqual([
    'Goblins at the old ford',
  ]);
}

async function holdsTheLimit(store: SavedEncounterStore) {
  const first = record('ravenford', 'Encounter 0', '2026-11-03T09:00:00.000Z');
  expect(await store.put(first)).toBe(true);
  for (let index = 1; index < MAX_SAVED_ENCOUNTERS - 1; index += 1) {
    expect(
      await store.put(
        record('ravenford', `Encounter ${String(index)}`, '2026-11-03T09:01:00.000Z'),
      ),
    ).toBe(true);
  }
  // One place left, and two new ones written at once: only one takes it.
  const both = await Promise.all([
    store.put(record('ravenford', 'One tab', '2026-11-03T09:02:00.000Z')),
    store.put(record('ravenford', 'The other tab', '2026-11-03T09:02:00.000Z')),
  ]);
  expect(both.filter(Boolean)).toHaveLength(1);
  expect(await store.list('ravenford')).toHaveLength(MAX_SAVED_ENCOUNTERS);
  // A full campaign still changes what it has.
  expect(
    await store.put({
      ...first,
      encounter: encounter('Changed'),
      updatedAt: '2026-11-03T09:03:00Z',
    }),
  ).toBe(true);
}

describe('the DM’s saved encounters beside the world', () => {
  it('PostgreSQL keeps and forgets them as the in-memory store does', async () => {
    await keepsAndForgets(new InMemorySavedEncounterStore());
    await keepsAndForgets(new PostgresSavedEncounterStore(pool));
  });

  it('PostgreSQL holds the campaign’s limit, even against two tabs at once', async () => {
    await holdsTheLimit(new InMemorySavedEncounterStore());
    await holdsTheLimit(new PostgresSavedEncounterStore(pool));
  });

  it('PostgreSQL refuses a body past 64 KB', async () => {
    const store = new PostgresSavedEncounterStore(pool);
    const huge = record('ravenford', 'Huge', '2026-11-03T11:00:00.000Z');
    await expect(
      store.put({ ...huge, encounter: { ...huge.encounter, name: 'x'.repeat(70_000) } }),
    ).rejects.toThrow();
    expect(await store.list('ravenford')).toEqual([]);
  });
});
