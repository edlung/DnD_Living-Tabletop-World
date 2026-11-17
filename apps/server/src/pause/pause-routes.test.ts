import {
  PAUSE_AGAIN_MS,
  PAUSE_ASK_MS,
  PAUSE_SEEN_MS,
  type ChatLogResponse,
  type DisplayPairingResponse,
  type PauseAsksResponse,
} from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { liveRavenford, readyLive } from '../testing/live.ts';
import { TOKENS, get, post, ravenfordApp } from '../testing/ravenford-app.ts';
import { signInTable } from '../testing/sign-in.ts';

/**
 * A player's quiet request for a pause (docs/adr/0073-table-ideas.md §2): a player asks as their
 * own character; the DM reads every request; the asker reads their own; nobody else at the table
 * — another player, the party's shared view, a table display — learns that anyone asked.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';
const BRANN = 'brann-ironvale';
/** The DM playing Brann: the table's other player, as the server sees one. */
const AS_BRANN = `CHARACTER:${BRANN}`;

const ask = (perspective: string, token?: string, body: unknown = {}) =>
  post(app, `${BASE}/pause-requests?perspective=${perspective}`, body, token);
const answer = (perspective: string, token: string | undefined, characterId: string) =>
  post(app, `${BASE}/pause-requests/answer?perspective=${perspective}`, { characterId }, token);
const read = (perspective: string, token?: string) =>
  get(app, `${BASE}/pause-requests?perspective=${perspective}`, token);
const asksOf = async (perspective: string, token: string) =>
  (await read(perspective, token)).json<PauseAsksResponse>().asks;
const pause = (paused: boolean) => post(app, `${BASE}/lobby?perspective=DM`, { paused }, TOKENS.dm);

beforeEach(async () => {
  app = await ravenfordApp();
});

afterEach(async () => {
  vi.useRealTimers();
  await app.close();
});

describe('a request for a pause', () => {
  it('is asked by a player as their character, read by the DM, and by the asker as their own', async () => {
    expect(await asksOf('DM', TOKENS.dm)).toEqual([]);
    expect((await ask('PLAYER', TOKENS.player)).statusCode).toBe(204);
    const waiting = [{ character: { entityId: ELOWEN, name: 'Elowen Starwhisper' }, seen: false }];
    expect(await asksOf('DM', TOKENS.dm)).toEqual(waiting);
    expect(await asksOf('PLAYER', TOKENS.player)).toEqual(waiting);
    // The DM says it is seen: the asker reads so, for a moment.
    expect((await answer('DM', TOKENS.dm, ELOWEN)).statusCode).toBe(204);
    expect((await asksOf('PLAYER', TOKENS.player))[0]?.seen).toBe(true);
  });

  it('is not another player’s to read, nor the party’s, nor the public’s', async () => {
    // Brann's player asks (the DM playing him): Elowen's player reads nothing of it.
    expect((await ask(AS_BRANN, TOKENS.dm)).statusCode).toBe(204);
    expect(await asksOf('PLAYER', TOKENS.player)).toEqual([]);
    expect(await asksOf(`CHARACTER:${ELOWEN}`, TOKENS.player)).toEqual([]);
    expect((await read('PARTY', TOKENS.player)).statusCode).toBe(403);
    expect((await read('PUBLIC', TOKENS.player)).statusCode).toBe(403);
    expect((await read('PARTY', TOKENS.dm)).statusCode).toBe(403);
    // Nor another's hero's view, nor the DM's, for a player.
    expect((await read(AS_BRANN, TOKENS.player)).statusCode).toBe(403);
    expect((await read('DM', TOKENS.player)).statusCode).toBe(403);
    expect((await read('PLAYER', TOKENS.outsider)).statusCode).toBe(404);
    expect((await read('PLAYER')).statusCode).toBe(401);
    // Both ask: each player still reads only their own; the DM both.
    await ask('PLAYER', TOKENS.player);
    expect((await asksOf('PLAYER', TOKENS.player)).map((one) => one.character.entityId)).toEqual([
      ELOWEN,
    ]);
    expect((await asksOf(AS_BRANN, TOKENS.dm)).map((one) => one.character.entityId)).toEqual([
      BRANN,
    ]);
    expect((await asksOf('DM', TOKENS.dm)).map((one) => one.character.entityId)).toEqual([
      BRANN,
      ELOWEN,
    ]);
  });

  it('is nobody else’s to ask or to answer', async () => {
    expect((await ask('PLAYER')).statusCode).toBe(401);
    expect((await ask('PLAYER', TOKENS.outsider)).statusCode).toBe(404);
    // The DM pauses; the party's shared view and the public one ask as nobody.
    expect((await ask('DM', TOKENS.dm)).statusCode).toBe(403);
    expect((await ask('PARTY', TOKENS.player)).statusCode).toBe(403);
    expect((await ask('PUBLIC', TOKENS.player)).statusCode).toBe(403);
    expect((await ask(AS_BRANN, TOKENS.player)).statusCode).toBe(403);
    // Only the DM answers.
    await ask('PLAYER', TOKENS.player);
    expect((await answer('PLAYER', TOKENS.player, ELOWEN)).statusCode).toBe(403);
    expect((await answer('DM', TOKENS.player, ELOWEN)).statusCode).toBe(403);
    expect((await answer('DM', TOKENS.outsider, ELOWEN)).statusCode).toBe(404);
    expect((await answer('DM', undefined, ELOWEN)).statusCode).toBe(401);
    expect((await asksOf('DM', TOKENS.dm))[0]?.seen).toBe(false);
  });

  it('carries nothing: no words, no other character', async () => {
    for (const body of [
      { text: 'I am scared' },
      { characterId: BRANN },
      { reason: 'tired' },
      [],
      'pause',
    ]) {
      expect((await ask('PLAYER', TOKENS.player, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
    for (const body of [{}, { characterId: 'Not An Id' }, { characterId: ELOWEN, note: 'x' }]) {
      const tried = await post(
        app,
        `${BASE}/pause-requests/answer?perspective=DM`,
        body,
        TOKENS.dm,
      );
      expect(tried.statusCode, JSON.stringify(body)).toBe(400);
    }
    expect(await asksOf('DM', TOKENS.dm)).toEqual([]);
  });

  it('is one request however often the button is pressed, and a new one after a minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-16T18:00:00.000Z') });
    for (let press = 0; press < 5; press += 1) {
      expect((await ask('PLAYER', TOKENS.player)).statusCode).toBe(204);
    }
    expect(await asksOf('DM', TOKENS.dm)).toHaveLength(1);
    await answer('DM', TOKENS.dm, ELOWEN);
    // Pressed again within the minute, the seen request stands: the DM is not asked twice.
    await ask('PLAYER', TOKENS.player);
    expect((await asksOf('DM', TOKENS.dm))[0]?.seen).toBe(true);
    vi.setSystemTime(Date.now() + PAUSE_AGAIN_MS);
    await ask('PLAYER', TOKENS.player);
    expect((await asksOf('DM', TOKENS.dm))[0]?.seen).toBe(false);
  });

  it('is refused past a script’s pace', async () => {
    const statuses: number[] = [];
    for (let press = 0; press < 14; press += 1) {
      statuses.push((await ask('PLAYER', TOKENS.player)).statusCode);
    }
    expect(statuses.filter((status) => status === 204)).toHaveLength(12);
    expect(statuses.slice(12)).toEqual([429, 429]);
  });

  it('is gone a moment after it is seen, and ages out unanswered', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-16T18:00:00.000Z') });
    await ask('PLAYER', TOKENS.player);
    await answer('DM', TOKENS.dm, ELOWEN);
    vi.setSystemTime(Date.now() + PAUSE_SEEN_MS - 1);
    expect(await asksOf('PLAYER', TOKENS.player)).toHaveLength(1);
    vi.setSystemTime(Date.now() + 1);
    expect(await asksOf('PLAYER', TOKENS.player)).toEqual([]);
    expect(await asksOf('DM', TOKENS.dm)).toEqual([]);
    // Unanswered, it waits ten minutes and no longer.
    await ask('PLAYER', TOKENS.player);
    vi.setSystemTime(Date.now() + PAUSE_ASK_MS - 1);
    expect(await asksOf('DM', TOKENS.dm)).toHaveLength(1);
    vi.setSystemTime(Date.now() + 1);
    expect(await asksOf('DM', TOKENS.dm)).toEqual([]);
  });

  it('is answered by the pause itself, and refused while the game is paused', async () => {
    await ask('PLAYER', TOKENS.player);
    expect((await pause(true)).statusCode).toBe(204);
    expect((await asksOf('PLAYER', TOKENS.player))[0]?.seen).toBe(true);
    expect((await ask('PLAYER', TOKENS.player)).statusCode).toBe(422);
    expect((await pause(false)).statusCode).toBe(204);
  });

  it('is asked only of a game in play, and forgotten when the session ends', async () => {
    await ask('PLAYER', TOKENS.player);
    const ended = await post(
      app,
      `${BASE}/commands`,
      { commandId: 'pause-test.end', command: { type: 'EndSession', sessionId: 'ravenford-s1' } },
      TOKENS.dm,
    );
    expect(ended.statusCode).toBe(200);
    expect(await asksOf('DM', TOKENS.dm)).toEqual([]);
    expect((await ask('PLAYER', TOKENS.player)).statusCode).toBe(422);
  });

  it('leaves no message in chat: it is not table talk', async () => {
    await ask('PLAYER', TOKENS.player);
    const chat = (await get(app, `${BASE}/chat?perspective=DM`, TOKENS.dm)).json<ChatLogResponse>();
    expect(chat.messages).toEqual([]);
  });
});

describe('a table display', () => {
  it('neither reads a request nor asks', async () => {
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
    const given = await table.send(
      'POST',
      `${BASE}/pause-requests?perspective=${AS_BRANN}`,
      { cookie: dm },
      {},
    );
    expect(given.statusCode).toBe(204);
    for (const perspective of ['PARTY', 'PUBLIC']) {
      const shown = await table.send('GET', `${BASE}/pause-requests?perspective=${perspective}`, {
        cookie,
      });
      expect(shown.statusCode).toBe(403);
      expect(shown.body).not.toContain(BRANN);
    }
    const tried = await table.send(
      'POST',
      `${BASE}/pause-requests?perspective=PARTY`,
      { cookie },
      {},
    );
    expect([401, 403]).toContain(tried.statusCode);
    await table.app.close();
  });
});

describe('a request and the live stream', () => {
  it('signals the DM and the asker, and no other player', async () => {
    const live = await liveRavenford();
    const url = (query: string) => `${BASE}/live?${query}`;
    const dm = await readyLive(live.app, url('perspective=DM'), TOKENS.dm);
    const elowen = await readyLive(live.app, url('perspective=PLAYER'), TOKENS.player);
    const changes = (stream: typeof dm) =>
      stream.messages().filter((message) => message.type === 'changed').length;
    // Each arrival is news to the other (presence): what counts is what follows.
    await live.hub.cycle();
    await live.hub.cycle();
    const before = { dm: changes(dm), elowen: changes(elowen) };
    // Brann's player asks: the DM's screen hears of it, Elowen's does not.
    const asked = await post(
      live.app,
      `${BASE}/pause-requests?perspective=${AS_BRANN}`,
      {},
      TOKENS.dm,
    );
    expect(asked.statusCode).toBe(204);
    await live.hub.cycle();
    expect(changes(dm)).toBe(before.dm + 1);
    expect(changes(elowen)).toBe(before.elowen);
    // Elowen asks: now her own screen hears of it too.
    await post(live.app, `${BASE}/pause-requests?perspective=PLAYER`, {}, TOKENS.player);
    await live.hub.cycle();
    expect(changes(dm)).toBe(before.dm + 2);
    expect(changes(elowen)).toBe(before.elowen + 1);
    // The DM answers Brann: nothing Elowen reads has changed.
    await post(
      live.app,
      `${BASE}/pause-requests/answer?perspective=DM`,
      { characterId: BRANN },
      TOKENS.dm,
    );
    await live.hub.cycle();
    expect(changes(elowen)).toBe(before.elowen + 1);
    dm.disconnect();
    elowen.disconnect();
    await live.app.close();
  });
});
