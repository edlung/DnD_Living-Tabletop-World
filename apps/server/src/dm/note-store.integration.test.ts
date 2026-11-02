import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import type { DmNoteRecord } from './note-store.ts';
import { PostgresDmNoteStore } from './postgres-note-store.ts';

/**
 * The DM's notes on PostgreSQL (migration 0029, Stage 620): written, changed, deleted and never
 * listed again, per campaign, newest change first.
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

const note = (campaignId: string, title: string, at: string): DmNoteRecord => ({
  campaignId,
  noteId: randomUUID(),
  title,
  body: `${title} in detail`,
  createdAt: at,
  updatedAt: at,
});

describe('PostgresDmNoteStore', () => {
  it('keeps a campaign’s notes, newest change first, and hides a deleted one', async () => {
    const store = new PostgresDmNoteStore(pool);
    const villain = note('ravenford', 'The villain', '2026-11-02T10:00:00.000Z');
    const loot = note('ravenford', 'Loot', '2026-11-02T10:05:00.000Z');
    expect(await store.create(villain)).toBe(true);
    expect(await store.create(loot)).toBe(true);
    expect(await store.create(note('other-table', 'Elsewhere', '2026-11-02T10:06:00.000Z'))).toBe(
      true,
    );
    expect((await store.list('ravenford')).map((entry) => entry.title)).toEqual([
      'Loot',
      'The villain',
    ]);
    expect(
      await store.update('ravenford', villain.noteId, {
        title: 'The villain, unmasked',
        body: 'It was the alchemist.',
        updatedAt: '2026-11-02T10:10:00.000Z',
      }),
    ).toBe(true);
    expect((await store.list('ravenford'))[0]).toMatchObject({
      title: 'The villain, unmasked',
      body: 'It was the alchemist.',
    });
    // Another campaign's note is not this campaign's to change.
    expect(
      await store.update('other-table', villain.noteId, {
        title: 'x',
        body: '',
        updatedAt: '2026-11-02T10:11:00.000Z',
      }),
    ).toBe(false);
    expect(await store.delete('ravenford', loot.noteId, '2026-11-02T10:12:00.000Z')).toBe(true);
    expect(await store.delete('ravenford', loot.noteId, '2026-11-02T10:13:00.000Z')).toBe(false);
    expect((await store.list('ravenford')).map((entry) => entry.noteId)).toEqual([villain.noteId]);
  });
});
