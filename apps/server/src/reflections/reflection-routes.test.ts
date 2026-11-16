import type { DisplayPairingResponse, ReflectionsResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TOKENS, get, post, ravenfordApp } from '../testing/ravenford-app.ts';
import { signInTable } from '../testing/sign-in.ts';

/**
 * Stars and wishes (docs/adr/0071-memory-and-ritual.md §2): everyone at the table reads the stars;
 * a wish is its author's and the DM's. A player writes for their own character, the DM for anyone
 * and for themself, between sessions, for the session that ended last.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const SESSION = 'ravenford-s1';
const ELOWEN = 'elowen-starwhisper';
const BRANN = 'brann-ironvale';
const WISH = 'I wish the fights were shorter.';
const BRANN_WISH = 'More riddles, please.';
let counter = 0;

const command = (body: Record<string, unknown>) => {
  counter += 1;
  return post(
    app,
    `${BASE}/commands`,
    { commandId: `reflections-test.${String(counter)}`, command: body },
    TOKENS.dm,
  );
};
const write = (perspective: string, token: string, body: Record<string, unknown>) =>
  post(
    app,
    `${BASE}/reflections?perspective=${perspective}`,
    { sessionId: SESSION, ...body },
    token,
  );
const read = (perspective: string, token: string) =>
  get(app, `${BASE}/reflections?perspective=${perspective}`, token);
const entriesOf = async (perspective: string, token: string) =>
  (await read(perspective, token)).json<ReflectionsResponse>().sessions[0]?.entries ?? [];

beforeEach(async () => {
  app = await ravenfordApp();
});

afterEach(async () => {
  await app.close();
});

describe('stars and wishes', () => {
  it('are written between sessions only, for the session that ended last', async () => {
    const mine = { characterId: ELOWEN, star: 'The chase!', wish: WISH };
    // The session still plays: nothing is written yet, and nothing is listed.
    expect((await write('PLAYER', TOKENS.player, mine)).statusCode).toBe(422);
    expect((await read('PLAYER', TOKENS.player)).json<ReflectionsResponse>().sessions).toEqual([]);

    expect((await command({ type: 'EndSession', sessionId: SESSION })).statusCode).toBe(200);
    expect((await write('PLAYER', TOKENS.player, mine)).statusCode).toBe(204);
    const listed = (await read('PLAYER', TOKENS.player)).json<ReflectionsResponse>();
    expect(listed.sessions).toEqual([
      {
        sessionId: SESSION,
        title: 'Session 1: Arrival in Ravenford',
        open: true,
        entries: [
          {
            author: { entityId: ELOWEN, name: 'Elowen Starwhisper' },
            star: 'The chase!',
            wish: WISH,
            own: true,
          },
        ],
      },
    ]);
    // Written again it is replaced; emptied it is gone.
    expect(
      (await write('PLAYER', TOKENS.player, { ...mine, star: 'The chase on the roofs!' }))
        .statusCode,
    ).toBe(204);
    expect((await entriesOf('PLAYER', TOKENS.player))[0]?.star).toBe('The chase on the roofs!');
    expect(
      (await write('PLAYER', TOKENS.player, { characterId: ELOWEN, star: '', wish: '' }))
        .statusCode,
    ).toBe(204);
    expect(await entriesOf('PLAYER', TOKENS.player)).toEqual([]);

    // The next session starts: the last one is closed for writing, and stays to read.
    expect((await write('PLAYER', TOKENS.player, mine)).statusCode).toBe(204);
    expect(
      (await command({ type: 'StartSession', sessionId: 'evening-two', title: 'Session 2' }))
        .statusCode,
    ).toBe(200);
    expect((await write('PLAYER', TOKENS.player, mine)).statusCode).toBe(422);
    const later = (await read('PLAYER', TOKENS.player)).json<ReflectionsResponse>();
    expect(later.sessions.map((session) => [session.sessionId, session.open])).toEqual([
      [SESSION, false],
    ]);
    expect(later.sessions[0]?.entries).toHaveLength(1);
  });

  it('show everyone the stars and a wish only to its author and the DM', async () => {
    await command({ type: 'EndSession', sessionId: SESSION });
    expect(
      (
        await write('PLAYER', TOKENS.player, {
          characterId: ELOWEN,
          star: 'The chase!',
          wish: WISH,
        })
      ).statusCode,
    ).toBe(204);
    // The DM writes for a child who said it aloud, a wish alone for another, and their own.
    expect(
      (
        await write('DM', TOKENS.dm, {
          characterId: BRANN,
          star: 'Brann held the bridge.',
          wish: BRANN_WISH,
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await write('DM', TOKENS.dm, {
          characterId: 'tamsin-quickfoot',
          star: '',
          wish: 'A quieter evening.',
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await write('DM', TOKENS.dm, { characterId: null, star: 'You all listened.', wish: '' }))
        .statusCode,
    ).toBe(204);

    // The DM reads every star and every wish.
    const dm = await entriesOf('DM', TOKENS.dm);
    expect(dm).toHaveLength(4);
    expect(dm.every((entry) => entry.own && entry.wish !== null)).toBe(true);
    expect(dm.find((entry) => entry.author === null)?.star).toBe('You all listened.');

    // Elowen's player: every star, her own wish, nobody else's; a wish alone is not listed at all.
    const player = await read('PLAYER', TOKENS.player);
    const seen = player.json<ReflectionsResponse>().sessions[0]?.entries ?? [];
    const byAuthor = new Map(
      seen.map((entry) => [entry.author?.entityId ?? 'dm', [entry.wish, entry.own]]),
    );
    expect(byAuthor).toEqual(
      new Map([
        [ELOWEN, [WISH, true]],
        [BRANN, [null, false]],
        ['dm', [null, false]],
      ]),
    );
    expect(player.body).not.toContain(BRANN_WISH);
    expect(player.body).not.toContain('A quieter evening.');

    // The party's shared view, as a player takes it: stars only, her own wish neither.
    const party = await read('PARTY', TOKENS.player);
    expect(party.statusCode).toBe(200);
    expect(party.body).toContain('The chase!');
    for (const wish of [WISH, BRANN_WISH, 'A quieter evening.']) {
      expect(party.body).not.toContain(wish);
    }
    expect(
      party.json<ReflectionsResponse>().sessions[0]?.entries.every((entry) => !entry.own),
    ).toBe(true);
  });

  it('are a player’s own to write, never another’s; a stranger reads and writes nothing', async () => {
    await command({ type: 'EndSession', sessionId: SESSION });
    const forBrann = { characterId: BRANN, star: 'Mine now', wish: '' };
    expect((await write('PLAYER', TOKENS.player, forBrann)).statusCode).toBe(403);
    expect(
      (await write('PLAYER', TOKENS.player, { characterId: null, star: 'As the DM', wish: '' }))
        .statusCode,
    ).toBe(403);
    // The party's view writes nothing, even the player's own character's.
    expect(
      (await write('PARTY', TOKENS.player, { characterId: ELOWEN, star: 'x', wish: '' }))
        .statusCode,
    ).toBe(403);
    expect((await write('DM', TOKENS.player, forBrann)).statusCode).toBe(403);
    expect((await write('PLAYER', TOKENS.outsider, forBrann)).statusCode).toBe(404);
    expect((await read('PARTY', TOKENS.outsider)).statusCode).toBe(404);
    expect((await read('DM', TOKENS.player)).statusCode).toBe(403);
    // The DM's are for someone at the table, of that session, within the length.
    expect(
      (await write('DM', TOKENS.dm, { characterId: 'mira-vale', star: 'An NPC', wish: '' }))
        .statusCode,
    ).toBe(422);
    expect(
      (
        await write('DM', TOKENS.dm, {
          sessionId: 'no-such-session',
          characterId: BRANN,
          star: 'x',
          wish: '',
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (await write('DM', TOKENS.dm, { characterId: BRANN, star: 'x'.repeat(281), wish: '' }))
        .statusCode,
    ).toBe(400);
    expect(await entriesOf('DM', TOKENS.dm)).toEqual([]);
  });

  it('give the book every evening, and the DM reading as the party no wish', async () => {
    expect((await command({ type: 'EndSession', sessionId: SESSION })).statusCode).toBe(200);
    expect(
      (
        await write('PLAYER', TOKENS.player, {
          characterId: ELOWEN,
          star: 'The chase!',
          wish: WISH,
        })
      ).statusCode,
    ).toBe(204);
    for (let evening = 2; evening <= 22; evening += 1) {
      const sessionId = `evening-${String(evening)}`;
      expect(
        (await command({ type: 'StartSession', sessionId, title: `Evening ${String(evening)}` }))
          .statusCode,
      ).toBe(200);
      expect((await command({ type: 'EndSession', sessionId })).statusCode).toBe(200);
    }
    const latest = (await read('PARTY', TOKENS.dm)).json<ReflectionsResponse>();
    expect(latest.sessions).toHaveLength(20);
    expect(latest.sessions.some((session) => session.sessionId === SESSION)).toBe(false);
    const book = await get(app, `${BASE}/reflections?perspective=PARTY&book=true`, TOKENS.dm);
    const whole = book.json<ReflectionsResponse>();
    expect(whole.sessions).toHaveLength(22);
    // The book is the party's (ADR 0072 §1): the DM reading it as the party is sent the star alone.
    expect(whole.sessions.at(-1)?.entries).toEqual([
      expect.objectContaining({ star: 'The chase!', wish: null, own: false }),
    ]);
    expect(book.body).not.toContain(WISH);
    expect(
      (await get(app, `${BASE}/reflections?perspective=PARTY&book=yes`, TOKENS.dm)).statusCode,
    ).toBe(400);
  });

  it('show a table display the stars and never a wish; it writes nothing', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    const asked = await table.send('POST', '/display/pair', {}, {});
    const header = asked.headers['set-cookie'];
    const cookie =
      (Array.isArray(header) ? header : [header ?? ''])
        .map((value) => value.split(';')[0] ?? '')
        .find((pair) => pair.startsWith('ltw_display=')) ?? '';
    const { code } = asked.json<DisplayPairingResponse>();
    await table.send('POST', '/campaigns/ravenford/displays', { cookie: dm }, { code });
    await table.send(
      'POST',
      `${BASE}/commands`,
      { cookie: dm },
      {
        commandId: 'reflections-test.display-end',
        command: { type: 'EndSession', sessionId: SESSION },
      },
    );
    const written = await table.send(
      'POST',
      `${BASE}/reflections?perspective=DM`,
      { cookie: dm },
      { sessionId: SESSION, characterId: BRANN, star: 'Brann held the bridge.', wish: BRANN_WISH },
    );
    expect(written.statusCode).toBe(204);
    const shown = await table.send('GET', `${BASE}/reflections?perspective=PARTY`, { cookie });
    expect(shown.statusCode).toBe(200);
    expect(shown.body).toContain('Brann held the bridge.');
    expect(shown.body).not.toContain(BRANN_WISH);
    expect(
      (await table.send('GET', `${BASE}/reflections?perspective=DM`, { cookie })).statusCode,
    ).toBe(403);
    const tried = await table.send(
      'POST',
      `${BASE}/reflections?perspective=PARTY`,
      { cookie },
      { sessionId: SESSION, characterId: BRANN, star: 'From the TV', wish: '' },
    );
    expect(tried.statusCode).toBeGreaterThanOrEqual(400);
    await table.app.close();
  });
});
