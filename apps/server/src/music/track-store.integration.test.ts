import { randomUUID } from 'node:crypto';

import { MAX_TRACKS } from '@ltw/contracts';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresTrackStore } from './postgres-track-store.ts';
import { InMemoryTrackStore, type TrackAdd, type TrackStore } from './track-store.ts';

/**
 * The DM's music on PostgreSQL (migration 0038, Stage 690c), held to the in-memory store's
 * semantics: per campaign, oldest first; a range of a track's bytes read alone; an upload retried
 * with its request ID adds the track once; no thirty-first, not even two added at once; a deleted
 * track gone.
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

const bytes = (length: number) => Uint8Array.from({ length }, (_, index) => (index * 7 + 3) % 256);

const track = (campaignId: string, title: string, at: string, length = 32): TrackAdd => ({
  campaignId,
  trackId: randomUUID(),
  requestId: randomUUID(),
  title,
  mediaType: 'audio/ogg',
  addedAt: at,
  content: bytes(length),
});

for (const [name, make] of [
  ['in memory', () => new InMemoryTrackStore()],
  ['on PostgreSQL', () => new PostgresTrackStore(pool)],
] as const) {
  describe(`the tracks ${name}`, () => {
    let store: TrackStore;
    beforeEach(() => {
      store = make();
    });

    it('keeps a campaign’s tracks, oldest first, and reads a range of one', async () => {
      const second = await store.add(
        track('ravenford', 'Rain on the roof', '2026-11-04T10:05:00Z'),
      );
      const first = await store.add(
        track('ravenford', 'Tavern song', '2026-11-04T10:00:00Z', 5000),
      );
      await store.add(track('elsewhere', 'Not ours', '2026-11-04T09:00:00Z'));
      if (first === 'limit' || second === 'limit') throw new Error('a track was refused');
      expect((await store.list('ravenford')).map((one) => one.title)).toEqual([
        'Tavern song',
        'Rain on the roof',
      ]);
      expect(first).toMatchObject({ bytes: 5000, mediaType: 'audio/ogg' });
      expect(await store.read('ravenford', first.trackId, 100, 4)).toEqual(
        bytes(5000).slice(100, 104),
      );
      // Past its end: as much as there is.
      expect(await store.read('ravenford', first.trackId, 4990, 100)).toEqual(
        bytes(5000).slice(4990),
      );
      expect(await store.read('elsewhere', first.trackId, 0, 4)).toBeNull();
      expect(await store.delete('ravenford', first.trackId)).toBe(true);
      expect(await store.get('ravenford', first.trackId)).toBeNull();
      expect(await store.delete('ravenford', first.trackId)).toBe(false);
    });

    it('adds a retried upload once and no track past the campaign’s thirty', async () => {
      const once = track('ravenford', 'Once', '2026-11-04T10:00:00Z');
      const first = await store.add(once);
      const again = await store.add({ ...once, trackId: randomUUID() });
      expect(again).toEqual(first);
      // The rest of the thirty, the last two at once.
      for (let count = 1; count < MAX_TRACKS - 2; count += 1) {
        await store.add(track('ravenford', `Song ${String(count)}`, '2026-11-04T10:01:00Z'));
      }
      const together = await Promise.all(
        [1, 2, 3].map((index) =>
          store.add(track('ravenford', `Late ${String(index)}`, '2026-11-04T10:02:00Z')),
        ),
      );
      expect(together.filter((outcome) => outcome === 'limit')).toHaveLength(1);
      expect(await store.list('ravenford')).toHaveLength(MAX_TRACKS);
    });
  });
}
