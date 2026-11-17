import type { DisplayPairingResponse, EndingResponse, InventoryResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TOKENS, get, post, ravenfordApp } from '../testing/ravenford-app.ts';
import { signInTable } from '../testing/sign-in.ts';
import { OPEN_WHEN_FINISHED } from './guard.ts';

/**
 * A campaign's end and its heroes' keepsakes (docs/adr/0072-keepsakes.md §2): the DM finishes a
 * campaign between sessions and may reopen it; finished, it is read and not played; a player
 * chooses what their own hero keeps — a thing carried or a chapter of the party's story — and the
 * DM for anyone; every member and a table display read the end and the keepsakes.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const SESSION = 'ravenford-s1';
const ELOWEN = 'elowen-starwhisper';
const BRANN = 'brann-ironvale';
const CLOAK = 'item-5a1c7e30';
let counter = 0;

const command = (body: Record<string, unknown>) => {
  counter += 1;
  return post(
    app,
    `${BASE}/commands`,
    { commandId: `ending-test.${String(counter)}`, command: body },
    TOKENS.dm,
  );
};
const end = (body: Record<string, unknown>, perspective = 'DM', token: string = TOKENS.dm) =>
  post(app, `${BASE}/ending?perspective=${perspective}`, body, token);
const keep = (
  body: Record<string, unknown>,
  perspective = 'PLAYER',
  token: string = TOKENS.player,
) => post(app, `${BASE}/keepsakes?perspective=${perspective}`, body, token);
const read = async (perspective: string, token: string) =>
  (await get(app, `${BASE}/ending?perspective=${perspective}`, token)).json<EndingResponse>();
const finish = async (line = 'You brought the caravan home.') => {
  expect((await command({ type: 'EndSession', sessionId: SESSION })).statusCode).toBe(200);
  expect((await end({ finished: true, line })).statusCode).toBe(204);
};

beforeEach(async () => {
  app = await ravenfordApp();
});

afterEach(async () => {
  await app.close();
});

describe('a campaign’s end', () => {
  it('is the DM’s to mark between sessions, and to take back', async () => {
    expect(await read('PLAYER', TOKENS.player)).toMatchObject({ ending: null, keepsakes: [] });
    expect((await end({ finished: true }, 'PLAYER', TOKENS.player)).statusCode).toBe(403);
    // An evening is still open: it is closed first.
    expect((await end({ finished: true })).statusCode).toBe(422);
    expect((await end({ finished: true, line: 'x'.repeat(281) })).statusCode).toBe(400);
    expect((await end({ finished: true, extra: 1 })).statusCode).toBe(400);
    await finish();
    const finished = await read('PLAYER', TOKENS.player);
    expect(finished.ending).toEqual({
      finishedAt: expect.any(String) as string,
      line: 'You brought the caravan home.',
    });
    // Said again with other words: the day it ended stays.
    expect((await end({ finished: true, line: 'The road goes on.' })).statusCode).toBe(204);
    expect((await read('DM', TOKENS.dm)).ending).toEqual({
      finishedAt: finished.ending?.finishedAt,
      line: 'The road goes on.',
    });
    expect((await end({ finished: false })).statusCode).toBe(204);
    expect((await read('PLAYER', TOKENS.player)).ending).toBeNull();
    expect((await get(app, `${BASE}/ending?perspective=PARTY`, TOKENS.outsider)).statusCode).toBe(
      404,
    );
  });

  it('leaves a finished campaign to be read, not played, until it is reopened', async () => {
    await finish();
    const start = () => command({ type: 'StartSession', sessionId: 'another', title: 'Another' });
    const refused = await start();
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: { code: 'FINISHED' } });
    expect(
      (await post(app, `${BASE}/lobby/ready`, { characterId: ELOWEN, ready: true }, TOKENS.player))
        .statusCode,
    ).toBe(409);
    // Everything is still read; the last evening's stars are still written.
    expect((await get(app, `${BASE}/chronicle?perspective=PARTY`, TOKENS.player)).statusCode).toBe(
      200,
    );
    expect(
      (
        await post(
          app,
          `${BASE}/reflections?perspective=PLAYER`,
          { sessionId: SESSION, characterId: ELOWEN, star: 'All of it.', wish: '' },
          TOKENS.player,
        )
      ).statusCode,
    ).toBe(204);
    expect((await end({ finished: false })).statusCode).toBe(204);
    expect((await start()).statusCode).toBe(200);
  });
});

describe('what a hero keeps', () => {
  const cloak = { kind: 'item', refId: CLOAK, line: 'It still smells of the road.' };

  it('is chosen once the adventure is over: a thing the hero carries, named as they know it', async () => {
    expect((await keep({ characterId: ELOWEN, keep: cloak })).statusCode).toBe(422);
    await finish();
    const carried = (
      await get(app, `${BASE}/entities/${ELOWEN}/inventory?perspective=PLAYER`, TOKENS.player)
    ).json<InventoryResponse>();
    const name = carried.items.find((item) => item.itemId === CLOAK)?.name;
    expect(name).toBeTruthy();
    expect((await keep({ characterId: ELOWEN, keep: cloak })).statusCode).toBe(204);
    const mine = await read('PLAYER', TOKENS.player);
    expect(mine.keepsakes).toEqual([
      {
        hero: { entityId: ELOWEN, name: 'Elowen Starwhisper' },
        kind: 'item',
        refId: CLOAK,
        label: name,
        line: 'It still smells of the road.',
        own: true,
      },
    ]);
    expect(mine.heroes).toEqual([{ entityId: ELOWEN, name: 'Elowen Starwhisper' }]);
    // The whole table reads it; only its hero's player and the DM may change it.
    const party = await read('PARTY', TOKENS.player);
    expect(party.keepsakes).toMatchObject([{ label: name, own: false }]);
    expect(party.heroes).toEqual([]);
    expect((await read('DM', TOKENS.dm)).keepsakes).toMatchObject([{ own: true }]);
    // Not a thing nobody carries, nor one another hero carries; nor out of shape.
    for (const refId of ['item-nobody-has', 'item-of-brann']) {
      expect((await keep({ characterId: ELOWEN, keep: { ...cloak, refId } })).statusCode).toBe(422);
    }
    expect(
      (await keep({ characterId: ELOWEN, keep: { ...cloak, kind: 'photo' } })).statusCode,
    ).toBe(400);
    expect(
      (await keep({ characterId: ELOWEN, keep: { ...cloak, line: 'x'.repeat(201) } })).statusCode,
    ).toBe(400);
    // Chosen again replaces; null takes it away.
    expect(
      (await keep({ characterId: ELOWEN, keep: { ...cloak, line: 'Mine.' } })).statusCode,
    ).toBe(204);
    expect((await read('PLAYER', TOKENS.player)).keepsakes).toMatchObject([{ line: 'Mine.' }]);
    expect((await keep({ characterId: ELOWEN, keep: null })).statusCode).toBe(204);
    expect((await read('PLAYER', TOKENS.player)).keepsakes).toEqual([]);
  });

  it('may be a chapter of the party’s story, never one told from anyone else', async () => {
    const written: string[] = [];
    for (const perspective of ['PARTY', `CHARACTER:${ELOWEN}`]) {
      const chapter = await post(
        app,
        `${BASE}/chronicle`,
        { title: `Told from ${perspective}`, perspective, from: 0 },
        TOKENS.dm,
      );
      written.push(chapter.json<{ chronicleId: string }>().chronicleId);
    }
    const [party = '', own = ''] = written;
    await finish();
    const chosen = (refId: string) =>
      keep({ characterId: ELOWEN, keep: { kind: 'chapter', refId, line: '' } });
    expect((await chosen(own)).statusCode).toBe(422);
    expect((await chosen('no-such-chapter')).statusCode).toBe(422);
    expect((await chosen(party)).statusCode).toBe(204);
    expect((await read('PLAYER', TOKENS.player)).keepsakes).toMatchObject([
      { kind: 'chapter', refId: party, label: 'Told from PARTY', line: '' },
    ]);
  });

  it('is a player’s own hero’s to choose, and the DM’s for anyone', async () => {
    await finish();
    const cloakOf = { kind: 'item', refId: CLOAK, line: '' };
    // Another's hero, the party's view, an NPC: nobody chooses there.
    expect((await keep({ characterId: BRANN, keep: cloakOf })).statusCode).toBe(403);
    expect((await keep({ characterId: ELOWEN, keep: cloakOf }, 'PARTY')).statusCode).toBe(403);
    expect(
      (await keep({ characterId: 'mira-vale', keep: cloakOf }, 'DM', TOKENS.dm)).statusCode,
    ).toBe(403);
    expect(
      (await keep({ characterId: ELOWEN, keep: cloakOf }, 'PARTY', TOKENS.outsider)).statusCode,
    ).toBe(404);
    // The DM for a child who said it aloud: a thing that hero carries, never another's.
    expect((await keep({ characterId: BRANN, keep: cloakOf }, 'DM', TOKENS.dm)).statusCode).toBe(
      422,
    );
    expect((await keep({ characterId: ELOWEN, keep: cloakOf }, 'DM', TOKENS.dm)).statusCode).toBe(
      204,
    );
    const dm = await read('DM', TOKENS.dm);
    expect(dm.keepsakes).toHaveLength(1);
    expect(dm.heroes.map((hero) => hero.entityId)).toContain(BRANN);
  });

  it('is read by a table display, which chooses nothing', async () => {
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
    const shown = await table.send('GET', `${BASE}/ending?perspective=PARTY`, { cookie });
    expect(shown.statusCode).toBe(200);
    expect(shown.json<EndingResponse>()).toMatchObject({ ending: null, keepsakes: [], heroes: [] });
    const tried = await table.send(
      'POST',
      `${BASE}/keepsakes?perspective=PARTY`,
      { cookie },
      { characterId: ELOWEN, keep: null },
    );
    expect([401, 403]).toContain(tried.statusCode);
  });
});

describe('what a finished campaign still takes', () => {
  it('names only routes that exist', async () => {
    const table = await signInTable();
    for (const url of OPEN_WHEN_FINISHED) {
      // The workshop's routes are a composition of their own.
      if (url.startsWith('/workshop/')) continue;
      expect(table.app.hasRoute({ method: 'POST', url }), url).toBe(true);
    }
  });
});
