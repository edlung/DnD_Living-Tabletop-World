import { randomUUID } from 'node:crypto';

import { MAX_RANDOM_TABLES } from '@ltw/contracts';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { InMemoryLibraryStore, type LibraryRecord, type LibraryStore } from './library-store.ts';
import { PostgresLibraryStore } from './postgres-library-store.ts';

/**
 * The DM's library on PostgreSQL (migration 0036, Stage 680b), held to the in-memory store's
 * semantics: per campaign, newest change first, changed in place keeping when a handout was last
 * given, one kind an entry, a deleted one gone, and no new one past the campaign's limit of its
 * kind — not even two written at once.
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

type KeptRecord = Extract<LibraryRecord, { kind: 'handout' }>;
type TableRecord = Extract<LibraryRecord, { kind: 'table' }>;

const handout = (campaignId: string, title: string, at: string): KeptRecord => ({
  campaignId,
  entryId: randomUUID(),
  kind: 'handout',
  body: { title, text: 'North, past the mill.' },
  updatedAt: at,
  givenAt: null,
});

const table = (campaignId: string, name: string, at: string): TableRecord => ({
  campaignId,
  entryId: randomUUID(),
  kind: 'table',
  body: { name, die: 4, results: [{ from: 1, to: 4, text: 'Rain' }] },
  updatedAt: at,
  givenAt: null,
});

const names = (records: readonly LibraryRecord[]) =>
  records.map((one) => (one.kind === 'handout' ? one.body.title : one.body.name));

async function keepsAndForgets(store: LibraryStore) {
  const map = handout('ravenford', 'The map', '2026-11-03T10:00:00.000Z');
  const road = table('ravenford', 'Road', '2026-11-03T10:05:00.000Z');
  expect(await store.put(map)).toBe('written');
  expect(await store.put(road)).toBe('written');
  expect(await store.put(handout('other-table', 'Elsewhere', '2026-11-03T10:06:00.000Z'))).toBe(
    'written',
  );
  expect(names(await store.list('ravenford'))).toEqual(['Road', 'The map']);
  // Given, then changed: it keeps when it was given, and is now the newest.
  expect(await store.given('ravenford', map.entryId, '2026-11-03T10:07:00.000Z')).toBe(true);
  expect(await store.given('ravenford', road.entryId, '2026-11-03T10:07:00.000Z')).toBe(false);
  const changed = { ...map, body: { title: 'The old map', text: 'x' } };
  expect(await store.put({ ...changed, updatedAt: '2026-11-03T10:10:00.000Z' })).toBe('written');
  const [first] = await store.list('ravenford');
  expect(first?.kind === 'handout' && [first.body.title, first.givenAt]).toEqual([
    'The old map',
    '2026-11-03T10:07:00.000Z',
  ]);
  // One kind an entry; another campaign's is not this one's.
  expect(await store.put({ ...road, kind: 'handout', body: map.body, givenAt: null })).toBe('kind');
  expect(await store.get('other-table', map.entryId)).toBeNull();
  expect(await store.delete('other-table', map.entryId, 'handout')).toBe(false);
  expect(await store.delete('ravenford', map.entryId, 'table')).toBe(false);
  expect(await store.delete('ravenford', road.entryId, 'table')).toBe(true);
  expect(names(await store.list('ravenford'))).toEqual(['The old map']);
}

async function holdsTheLimit(store: LibraryStore) {
  for (let index = 0; index < MAX_RANDOM_TABLES - 1; index += 1) {
    expect(
      await store.put(table('ravenford', `Table ${String(index)}`, '2026-11-03T09:01:00.000Z')),
    ).toBe('written');
  }
  // One place left, and two new ones written at once: only one takes it.
  const both = await Promise.all([
    store.put(table('ravenford', 'One tab', '2026-11-03T09:02:00.000Z')),
    store.put(table('ravenford', 'The other tab', '2026-11-03T09:02:00.000Z')),
  ]);
  expect([...both].sort()).toEqual(['limit', 'written']);
  // The tables' limit is theirs: a handout is still kept.
  expect(await store.put(handout('ravenford', 'A letter', '2026-11-03T09:03:00.000Z'))).toBe(
    'written',
  );
}

describe('the DM’s library beside the world', () => {
  it('PostgreSQL keeps and forgets as the in-memory store does', async () => {
    await keepsAndForgets(new InMemoryLibraryStore());
    await keepsAndForgets(new PostgresLibraryStore(pool));
  });

  it('PostgreSQL holds the campaign’s limit, even against two tabs at once', async () => {
    await holdsTheLimit(new InMemoryLibraryStore());
    await holdsTheLimit(new PostgresLibraryStore(pool));
  });
});
