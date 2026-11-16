import { MAX_PLAYER_NOTES } from '@ltw/contracts';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { InMemoryNoteStore, type NoteStore } from './note-store.ts';
import { PostgresNoteStore } from './postgres-note-store.ts';

/**
 * Backstories and private notes on PostgreSQL (migration 0045, Stage 840), held to the in-memory
 * store's semantics: one backstory a character, emptied away; a note its owner's, as one
 * character, with its first time kept; a notebook bounded; a person's notes forgotten together.
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
const ELOWEN = 'elowen-starwhisper';
const BRANN = 'brann-ironvale';
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = (seconds: number) => new Date(Date.UTC(2026, 10, 16, 18, 0, seconds)).toISOString();
const mine = { campaignId: C, ownerId: 'player:one', characterId: ELOWEN };
const theirs = { campaignId: C, ownerId: 'player:two', characterId: ELOWEN };

async function story(store: NoteStore) {
  await store.writeBackstory({
    campaignId: C,
    characterId: ELOWEN,
    body: 'First.',
    writtenBy: 'dm',
    updatedAt: at(0),
  });
  await store.writeBackstory({
    campaignId: C,
    characterId: ELOWEN,
    body: 'Second.',
    writtenBy: 'player',
    updatedAt: at(1),
  });
  await store.writeBackstory({
    campaignId: C,
    characterId: BRANN,
    body: 'Brann’s.',
    writtenBy: 'dm',
    updatedAt: at(2),
  });
  const backstory = await store.backstory(C, ELOWEN);
  await store.writeBackstory({
    campaignId: C,
    characterId: BRANN,
    body: '',
    writtenBy: 'dm',
    updatedAt: at(3),
  });
  const gone = await store.backstory(C, BRANN);

  const first = await store.writeNote({ ...mine, noteId: ID(1), title: 'One', body: 'a', updatedAt: at(10) });
  await store.writeNote({ ...mine, noteId: ID(2), title: 'Two', body: '', updatedAt: at(11) });
  // Changed: its first time stays, its place moves up.
  await store.writeNote({ ...mine, noteId: ID(1), title: 'One', body: 'b', updatedAt: at(12) });
  // The same ID under another owner is another note; as another character it is refused.
  await store.writeNote({ ...theirs, noteId: ID(1), title: 'Theirs', body: '', updatedAt: at(13) });
  const stolen = await store.writeNote({
    ...mine,
    characterId: BRANN,
    noteId: ID(1),
    title: 'Moved',
    body: '',
    updatedAt: at(14),
  });
  const notes = await store.notes(mine);
  const others = await store.notes(theirs);
  // Another owner cannot delete it; its owner can.
  await store.deleteNote(theirs, ID(2));
  await store.deleteNote({ ...mine, characterId: BRANN }, ID(2));
  const kept = (await store.notes(mine)).length;
  await store.deleteNote(mine, ID(2));
  const after = await store.notes(mine);
  const ofOwner = await store.notesOfOwner(C, mine.ownerId);
  await store.forgetOwner(C, mine.ownerId);
  return {
    backstory,
    gone,
    first,
    stolen,
    notes,
    others,
    kept,
    after,
    ofOwner,
    forgotten: await store.notes(mine),
    untouched: await store.notes(theirs),
  };
}

describe('backstories and private notes on PostgreSQL', () => {
  it('behave as the in-memory store does', async () => {
    const expected = await story(new InMemoryNoteStore());
    const actual = await story(new PostgresNoteStore(pool));
    expect(actual).toEqual(expected);
    expect(actual.backstory).toMatchObject({ body: 'Second.', writtenBy: 'player' });
    expect(actual.gone).toBeNull();
    expect(actual.first).toBe(true);
    expect(actual.stolen).toBe(false);
    expect(actual.notes.map((note) => [note.noteId, note.body, note.createdAt])).toEqual([
      [ID(1), 'b', at(10)],
      [ID(2), '', at(11)],
    ]);
    expect(actual.others.map((note) => note.title)).toEqual(['Theirs']);
    expect(actual.kept).toBe(2);
    expect(actual.after.map((note) => note.noteId)).toEqual([ID(1)]);
    expect(actual.forgotten).toEqual([]);
    expect(actual.untouched).toHaveLength(1);
  });

  it('hold a notebook to its size', async () => {
    const store = new PostgresNoteStore(pool);
    for (let index = 0; index < MAX_PLAYER_NOTES; index += 1) {
      expect(
        await store.writeNote({ ...mine, noteId: ID(index), title: 'x', body: '', updatedAt: at(index) }),
      ).toBe(true);
    }
    expect(
      await store.writeNote({ ...mine, noteId: ID(999), title: 'x', body: '', updatedAt: at(999) }),
    ).toBe(false);
    expect(
      await store.writeNote({ ...mine, noteId: ID(3), title: 'y', body: '', updatedAt: at(1000) }),
    ).toBe(true);
    // Another owner's notebook has its own room.
    expect(
      await store.writeNote({ ...theirs, noteId: ID(999), title: 'x', body: '', updatedAt: at(1) }),
    ).toBe(true);
  });
});
