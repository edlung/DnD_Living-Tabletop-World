import {
  BACKSTORY_CHARS,
  MAX_PLAYER_NOTES,
  type BackstoryResponse,
  type DisplayPairingResponse,
  type PlayerNotesResponse,
} from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OPEN_WHEN_FINISHED } from '../ending/guard.ts';
import { TOKENS, get, post, ravenfordApp } from '../testing/ravenford-app.ts';
import { signInTable } from '../testing/sign-in.ts';

/**
 * A hero's backstory and a player's private notes (docs/adr/0073-table-ideas.md §5): the
 * backstory is its player's and the DM's; a private note is the person's who wrote it, and nobody
 * else's — not the DM's, though the DM may take that character's view.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';
const BRANN = 'brann-ironvale';
const AS_ELOWEN = `CHARACTER:${ELOWEN}`;
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const STORY = 'Elowen left the Silverwood to find her brother.';
const SECRET_NOTE = 'I think Brann is hiding something.';

const story = (id: string, perspective: string, token?: string) =>
  get(app, `${BASE}/entities/${id}/backstory?perspective=${perspective}`, token);
const writeStory = (id: string, perspective: string, token: string | undefined, body: unknown) =>
  post(app, `${BASE}/entities/${id}/backstory?perspective=${perspective}`, body, token);
const notes = (perspective: string, token?: string) =>
  get(app, `${BASE}/notes?perspective=${perspective}`, token);
const notesOf = async (perspective: string, token: string) =>
  (await notes(perspective, token)).json<PlayerNotesResponse>().notes;
const writeNote = (perspective: string, token: string | undefined, body: unknown) =>
  post(app, `${BASE}/notes?perspective=${perspective}`, body, token);
const deleteNote = (perspective: string, token: string | undefined, noteId: string) =>
  post(app, `${BASE}/notes/${noteId}/delete?perspective=${perspective}`, {}, token);

beforeEach(async () => {
  app = await ravenfordApp();
});

afterEach(async () => {
  await app.close();
});

describe('a hero’s backstory', () => {
  it('is written by its player and read by them and the DM', async () => {
    const empty = (await story(ELOWEN, 'PLAYER', TOKENS.player)).json<BackstoryResponse>();
    expect(empty).toMatchObject({ characterId: ELOWEN, body: '', writtenBy: null });
    expect((await writeStory(ELOWEN, 'PLAYER', TOKENS.player, { body: STORY })).statusCode).toBe(
      204,
    );
    for (const [perspective, token] of [
      ['PLAYER', TOKENS.player],
      [AS_ELOWEN, TOKENS.player],
      ['DM', TOKENS.dm],
    ] as const) {
      const read = (await story(ELOWEN, perspective, token)).json<BackstoryResponse>();
      expect(read, perspective).toMatchObject({ body: STORY, writtenBy: 'player' });
    }
  });

  it('may be written by the DM, for a child who tells it aloud, and changed by its player', async () => {
    expect(
      (await writeStory(ELOWEN, 'DM', TOKENS.dm, { body: 'Told at the table.' })).statusCode,
    ).toBe(204);
    const told = (await story(ELOWEN, 'PLAYER', TOKENS.player)).json<BackstoryResponse>();
    expect(told).toMatchObject({ body: 'Told at the table.', writtenBy: 'dm' });
    await writeStory(ELOWEN, 'PLAYER', TOKENS.player, { body: STORY });
    expect((await story(ELOWEN, 'DM', TOKENS.dm)).json<BackstoryResponse>().writtenBy).toBe(
      'player',
    );
    // Emptied, it is gone.
    await writeStory(ELOWEN, 'PLAYER', TOKENS.player, { body: '   ' });
    expect((await story(ELOWEN, 'DM', TOKENS.dm)).json<BackstoryResponse>()).toMatchObject({
      body: '',
      writtenBy: null,
      updatedAt: null,
    });
  });

  it('is nobody else’s: not another hero’s player’s, the party’s, the public’s or a stranger’s', async () => {
    await writeStory(BRANN, 'DM', TOKENS.dm, { body: 'Brann’s own story.' });
    // Elowen's player asks for Brann's, in every view she may take.
    for (const perspective of ['PLAYER', AS_ELOWEN, 'PARTY', 'PUBLIC']) {
      const read = await story(BRANN, perspective, TOKENS.player);
      expect(read.statusCode, perspective).toBe(403);
      expect(read.body).not.toContain('own story');
      const tried = await writeStory(BRANN, perspective, TOKENS.player, { body: 'Mine now.' });
      expect(tried.statusCode, perspective).toBe(403);
    }
    // Her own is not read through the party's shared view either: that is what a TV asks as.
    await writeStory(ELOWEN, 'PLAYER', TOKENS.player, { body: STORY });
    expect((await story(ELOWEN, 'PARTY', TOKENS.player)).statusCode).toBe(403);
    expect((await story(ELOWEN, 'PARTY', TOKENS.dm)).statusCode).toBe(403);
    // She takes neither Brann's view nor the DM's.
    expect((await story(BRANN, `CHARACTER:${BRANN}`, TOKENS.player)).statusCode).toBe(403);
    expect((await story(BRANN, 'DM', TOKENS.player)).statusCode).toBe(403);
    expect((await story(ELOWEN, 'PLAYER', TOKENS.outsider)).statusCode).toBe(404);
    expect((await story(ELOWEN, 'PLAYER')).statusCode).toBe(401);
    expect((await writeStory(ELOWEN, 'PLAYER', undefined, { body: 'x' })).statusCode).toBe(401);
    expect((await story(BRANN, 'DM', TOKENS.dm)).json<BackstoryResponse>().body).toBe(
      'Brann’s own story.',
    );
  });

  it('is a character’s only, and bounded', async () => {
    expect((await story('mira-vale', 'DM', TOKENS.dm)).statusCode).toBe(404);
    expect((await writeStory('mira-vale', 'DM', TOKENS.dm, { body: 'x' })).statusCode).toBe(404);
    for (const body of [
      { body: 'x'.repeat(BACKSTORY_CHARS + 1) },
      { text: 'x' },
      { body: 'x', writtenBy: 'dm' },
      {},
    ]) {
      expect(
        (await writeStory(ELOWEN, 'PLAYER', TOKENS.player, body)).statusCode,
        JSON.stringify(body).slice(0, 40),
      ).toBe(400);
    }
  });
});

describe('a player’s private notes', () => {
  it('are written, changed and deleted by the one who wrote them', async () => {
    expect(await notesOf('PLAYER', TOKENS.player)).toEqual([]);
    const note = { noteId: ID(1), title: 'About Brann', body: SECRET_NOTE };
    expect((await writeNote('PLAYER', TOKENS.player, note)).statusCode).toBe(204);
    // A retried request is the same note; a change replaces its words.
    expect((await writeNote('PLAYER', TOKENS.player, note)).statusCode).toBe(204);
    await writeNote('PLAYER', TOKENS.player, { ...note, body: 'He is honest after all.' });
    const read = await notesOf('PLAYER', TOKENS.player);
    expect(read).toHaveLength(1);
    expect(read[0]).toMatchObject({
      noteId: ID(1),
      title: 'About Brann',
      body: 'He is honest after all.',
    });
    expect((await deleteNote('PLAYER', TOKENS.player, ID(1))).statusCode).toBe(204);
    expect(await notesOf('PLAYER', TOKENS.player)).toEqual([]);
    // Deleting what is gone is done already.
    expect((await deleteNote('PLAYER', TOKENS.player, ID(1))).statusCode).toBe(204);
  });

  it('are never the DM’s to read — not in the DM’s view, not in the character’s', async () => {
    await writeNote('PLAYER', TOKENS.player, { noteId: ID(1), title: '', body: SECRET_NOTE });
    // The DM's view has no private notes at all.
    const asDm = await notes('DM', TOKENS.dm);
    expect(asDm.statusCode).toBe(403);
    expect(asDm.body).not.toContain('hiding');
    // The DM may take Elowen's view; the notes there are the DM's own, never her player's.
    const asHer = await notes(AS_ELOWEN, TOKENS.dm);
    expect(asHer.statusCode).toBe(200);
    expect(asHer.json<PlayerNotesResponse>().notes).toEqual([]);
    expect(asHer.body).not.toContain('hiding');
    // Nor can the DM change or delete it by its ID: the ID is the DM's own, a new note.
    expect((await deleteNote(AS_ELOWEN, TOKENS.dm, ID(1))).statusCode).toBe(204);
    expect(await notesOf('PLAYER', TOKENS.player)).toHaveLength(1);
    await writeNote(AS_ELOWEN, TOKENS.dm, { noteId: ID(1), title: 'The DM’s', body: 'Mine.' });
    expect((await notesOf('PLAYER', TOKENS.player))[0]?.body).toBe(SECRET_NOTE);
    expect((await notesOf(AS_ELOWEN, TOKENS.dm))[0]?.body).toBe('Mine.');
  });

  it('are nobody’s in the party’s or the public view, and no stranger’s', async () => {
    const note = { noteId: ID(1), title: '', body: 'x' };
    for (const perspective of ['PARTY', 'PUBLIC']) {
      expect((await notes(perspective, TOKENS.player)).statusCode, perspective).toBe(403);
      expect((await writeNote(perspective, TOKENS.player, note)).statusCode).toBe(403);
      expect((await deleteNote(perspective, TOKENS.player, ID(1))).statusCode).toBe(403);
    }
    expect((await writeNote('DM', TOKENS.dm, note)).statusCode).toBe(403);
    expect((await notes(`CHARACTER:${BRANN}`, TOKENS.player)).statusCode).toBe(403);
    expect((await notes('PLAYER', TOKENS.outsider)).statusCode).toBe(404);
    expect((await notes('PLAYER')).statusCode).toBe(401);
    expect((await writeNote('PLAYER', undefined, note)).statusCode).toBe(401);
  });

  it('hold something, are bounded in size and in number', async () => {
    for (const body of [
      { noteId: ID(1), title: '', body: '   ' },
      { noteId: 'not-an-id', title: 'x', body: '' },
      { noteId: ID(1), title: 'x'.repeat(121), body: '' },
      { noteId: ID(1), title: '', body: 'x'.repeat(4001) },
      { noteId: ID(1), title: 'x', body: '', characterId: BRANN },
      { noteId: ID(1), title: 'x', body: '', ownerId: 'dm-ravenford' },
      { title: 'x', body: '' },
    ]) {
      expect(
        (await writeNote('PLAYER', TOKENS.player, body)).statusCode,
        JSON.stringify(body).slice(0, 60),
      ).toBe(400);
    }
    // The DM writes as Elowen, so that the rate of one person does not stand in the way.
    for (let index = 0; index < MAX_PLAYER_NOTES; index += 1) {
      const who = index % 2 === 0 ? TOKENS.player : TOKENS.dm;
      const view = index % 2 === 0 ? 'PLAYER' : AS_ELOWEN;
      await writeNote(view, who, { noteId: ID(100 + index), title: String(index), body: '' });
    }
    expect(await notesOf('PLAYER', TOKENS.player)).toHaveLength(MAX_PLAYER_NOTES / 2);
    expect((await notes('PLAYER', TOKENS.player)).json<PlayerNotesResponse>().room).toBe(true);
  });

  it('refuse one more than the notebook holds', async () => {
    const store = (await import('./note-store.ts')).InMemoryNoteStore;
    const kept = new store();
    const owner = { campaignId: 'ravenford', ownerId: 'player-elowen', characterId: ELOWEN };
    for (let index = 0; index < MAX_PLAYER_NOTES; index += 1) {
      expect(
        await kept.writeNote({
          ...owner,
          noteId: ID(index),
          title: 'x',
          body: '',
          updatedAt: new Date(index * 1000).toISOString(),
        }),
      ).toBe(true);
    }
    const one = { ...owner, title: 'x', body: '', updatedAt: new Date(99_000_000).toISOString() };
    expect(await kept.writeNote({ ...one, noteId: ID(999) })).toBe(false);
    // A change to one already kept is taken.
    expect(await kept.writeNote({ ...one, noteId: ID(3) })).toBe(true);
    // The same ID as another character is not the same note.
    expect(await kept.writeNote({ ...one, characterId: BRANN, noteId: ID(3) })).toBe(false);
  });

  it('are refused past a person’s pace', async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 32; index += 1) {
      statuses.push(
        (await writeNote('PLAYER', TOKENS.player, { noteId: ID(1), title: 'x', body: '' }))
          .statusCode,
      );
    }
    expect(statuses.filter((status) => status === 204)).toHaveLength(30);
    expect(statuses.slice(30)).toEqual([429, 429]);
  });

  it('may still be written in a finished campaign; a backstory may not', () => {
    expect(OPEN_WHEN_FINISHED.has('/campaigns/:campaignId/notes')).toBe(true);
    expect(OPEN_WHEN_FINISHED.has('/campaigns/:campaignId/notes/:noteId/delete')).toBe(true);
    expect(OPEN_WHEN_FINISHED.has('/campaigns/:campaignId/entities/:entityId/backstory')).toBe(
      false,
    );
  });
});

describe('a table display', () => {
  it('reads no backstory and no note, and writes none', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    const asked = await table.send('POST', '/display/pair', {}, {});
    const header = asked.headers['set-cookie'];
    const cookie =
      (Array.isArray(header) ? header : [header ?? ''])
        .map((value) => value.split(';')[0] ?? '')
        .find((pair) => pair.startsWith('ltw_display=')) ?? '';
    const { code } = asked.json<DisplayPairingResponse>();
    await table.send('POST', `${BASE}/displays`, { cookie: dm }, { code });
    await table.send(
      'POST',
      `${BASE}/entities/${ELOWEN}/backstory?perspective=DM`,
      { cookie: dm },
      { body: STORY },
    );
    for (const perspective of ['PARTY', 'PUBLIC']) {
      const shown = await table.send(
        'GET',
        `${BASE}/entities/${ELOWEN}/backstory?perspective=${perspective}`,
        { cookie },
      );
      expect(shown.statusCode).toBe(403);
      expect(shown.body).not.toContain('Silverwood');
      expect(
        (await table.send('GET', `${BASE}/notes?perspective=${perspective}`, { cookie }))
          .statusCode,
      ).toBe(403);
    }
    const tried = await table.send(
      'POST',
      `${BASE}/notes?perspective=PARTY`,
      { cookie },
      { noteId: ID(1), title: 'x', body: '' },
    );
    expect([401, 403]).toContain(tried.statusCode);
    await table.app.close();
  });
});

describe('neither joins the live inventory', () => {
  it('so nobody’s screen is signalled by another’s writing', async () => {
    const { coverageInventory } = await import('../live/inventory.ts');
    for (const kind of ['CHARACTER', 'DM', 'PARTY'] as const) {
      const urls = coverageInventory({
        campaignId: 'ravenford',
        perspective: kind,
        kind,
        focus: ELOWEN,
        place: null,
        identity: true,
        display: kind === 'PARTY',
      }).map((view) => view.url);
      expect(urls.some((url) => url.includes('/notes') || url.includes('/backstory'))).toBe(false);
    }
  });
});
