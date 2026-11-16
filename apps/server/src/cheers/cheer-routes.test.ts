import { CHEER_MS, type CheersResponse, type DisplayPairingResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { liveRavenford, readyLive } from '../testing/live.ts';
import { TOKENS, get, post, ravenfordApp } from '../testing/ravenford-app.ts';
import { signInTable } from '../testing/sign-in.ts';

/**
 * Cheers at the table (docs/adr/0072-keepsakes.md §3): a player cheers as their own character,
 * the DM as the DM; every member and a table display read the cheers still held, and nobody
 * else; a cheer is gone after a few seconds and was never stored.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const cheer = (perspective: string, token: string | undefined, body: unknown) =>
  post(app, `${BASE}/cheers?perspective=${perspective}`, body, token);
const read = (perspective: string, token?: string) =>
  get(app, `${BASE}/cheers?perspective=${perspective}`, token);
const cheersOf = async (perspective: string, token: string) =>
  (await read(perspective, token)).json<CheersResponse>().cheers;

beforeEach(async () => {
  app = await ravenfordApp();
});

afterEach(async () => {
  vi.useRealTimers();
  await app.close();
});

describe('cheers at the table', () => {
  it('are given by a player as their character and by the DM as the DM, and read by the table', async () => {
    expect(await cheersOf('PLAYER', TOKENS.player)).toEqual([]);
    expect(
      (await cheer('PLAYER', TOKENS.player, { cheerId: ID(1), mark: 'applause' })).statusCode,
    ).toBe(204);
    expect((await cheer('DM', TOKENS.dm, { cheerId: ID(2), mark: 'laugh' })).statusCode).toBe(204);
    const expected = [
      { cheerId: ID(1), mark: 'applause', by: { entityId: ELOWEN, name: 'Elowen Starwhisper' } },
      { cheerId: ID(2), mark: 'laugh', by: null },
    ];
    expect(await cheersOf('PLAYER', TOKENS.player)).toEqual(expected);
    expect(await cheersOf('DM', TOKENS.dm)).toEqual(expected);
    // The party's shared view reads them too: what a table display asks as.
    expect(await cheersOf('PARTY', TOKENS.player)).toEqual(expected);
    // A retried request is the same cheer, not a second one.
    expect(
      (await cheer('PLAYER', TOKENS.player, { cheerId: ID(1), mark: 'applause' })).statusCode,
    ).toBe(204);
    expect(await cheersOf('DM', TOKENS.dm)).toHaveLength(2);
    // The DM playing a character cheers as that character.
    expect(
      (await cheer(`CHARACTER:${ELOWEN}`, TOKENS.dm, { cheerId: ID(3), mark: 'heart' })).statusCode,
    ).toBe(204);
    expect((await cheersOf('DM', TOKENS.dm)).at(-1)?.by?.entityId).toBe(ELOWEN);
  });

  it('are nobody else’s to give or to read', async () => {
    const body = { cheerId: ID(1), mark: 'applause' };
    expect((await cheer('PLAYER', undefined, body)).statusCode).toBe(401);
    expect((await read('PLAYER')).statusCode).toBe(401);
    // A stranger finds no campaign; a player takes neither the DM's view nor another's hero.
    expect((await cheer('PLAYER', TOKENS.outsider, body)).statusCode).toBe(404);
    expect((await read('PARTY', TOKENS.outsider)).statusCode).toBe(404);
    expect((await cheer('DM', TOKENS.player, body)).statusCode).toBe(403);
    expect((await cheer('CHARACTER:brann-ironvale', TOKENS.player, body)).statusCode).toBe(403);
    expect((await read('DM', TOKENS.player)).statusCode).toBe(403);
    // The party's shared view and the public one cheer as nobody.
    expect((await cheer('PARTY', TOKENS.player, body)).statusCode).toBe(403);
    expect((await cheer('PUBLIC', TOKENS.dm, body)).statusCode).toBe(403);
    expect(await cheersOf('DM', TOKENS.dm)).toEqual([]);
  });

  it('take a mark of the fixed few and nothing else', async () => {
    for (const body of [
      { cheerId: ID(1), mark: 'boo' },
      { cheerId: ID(1), mark: '👏' },
      { cheerId: 'not-an-id', mark: 'applause' },
      { cheerId: ID(1), mark: 'applause', text: 'Bravo!' },
      { cheerId: ID(1), mark: 'applause', characterId: 'brann-ironvale' },
      { mark: 'applause' },
      {},
    ]) {
      expect((await cheer('PLAYER', TOKENS.player, body)).statusCode, JSON.stringify(body)).toBe(
        400,
      );
    }
    expect(await cheersOf('DM', TOKENS.dm)).toEqual([]);
  });

  it('are gone after a few seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-16T18:00:00.000Z') });
    await cheer('PLAYER', TOKENS.player, { cheerId: ID(1), mark: 'wow' });
    vi.setSystemTime(Date.now() + CHEER_MS - 1);
    expect(await cheersOf('DM', TOKENS.dm)).toHaveLength(1);
    vi.setSystemTime(Date.now() + 1);
    expect(await cheersOf('DM', TOKENS.dm)).toEqual([]);
  });

  it('are refused past a thumb’s pace, and only for the one who pressed', async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 32; index += 1) {
      statuses.push(
        (await cheer('PLAYER', TOKENS.player, { cheerId: ID(100 + index), mark: 'laugh' }))
          .statusCode,
      );
    }
    expect(statuses.filter((status) => status === 204)).toHaveLength(30);
    expect(statuses.slice(30)).toEqual([429, 429]);
    expect((await cheer('DM', TOKENS.dm, { cheerId: ID(1), mark: 'heart' })).statusCode).toBe(204);
  });

  it('are still given in a finished campaign, and with the game paused', async () => {
    expect(
      (
        await post(
          app,
          `${BASE}/commands`,
          {
            commandId: 'cheers-test.end',
            command: { type: 'EndSession', sessionId: 'ravenford-s1' },
          },
          TOKENS.dm,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await post(app, `${BASE}/ending?perspective=DM`, { finished: true }, TOKENS.dm)).statusCode,
    ).toBeLessThan(300);
    // Play is refused; applause for the last page is not.
    expect(
      (
        await post(
          app,
          `${BASE}/lobby/ready?perspective=PLAYER`,
          { characterId: ELOWEN, ready: true },
          TOKENS.player,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (await cheer('PLAYER', TOKENS.player, { cheerId: ID(1), mark: 'applause' })).statusCode,
    ).toBe(204);
  });

  it('reach a table display, which gives none', async () => {
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
      `${BASE}/cheers?perspective=DM`,
      { cookie: dm },
      { cheerId: ID(1), mark: 'applause' },
    );
    expect(given.statusCode).toBe(204);
    const shown = await table.send('GET', `${BASE}/cheers?perspective=PARTY`, { cookie });
    expect(shown.statusCode).toBe(200);
    expect(shown.json<CheersResponse>().cheers).toEqual([
      { cheerId: ID(1), mark: 'applause', by: null },
    ]);
    const tried = await table.send(
      'POST',
      `${BASE}/cheers?perspective=PARTY`,
      { cookie },
      { cheerId: ID(2), mark: 'laugh' },
    );
    expect([401, 403]).toContain(tried.statusCode);
    await table.app.close();
  });
});

describe('a cheer and the live stream', () => {
  it('signals every screen that reads it, through the board the twin shares', async () => {
    const live = await liveRavenford();
    const url = (query: string) => `${BASE}/live?${query}`;
    const player = await readyLive(live.app, url('perspective=PLAYER'), TOKENS.player);
    const changes = () => player.messages().filter((message) => message.type === 'changed');
    await live.hub.cycle();
    expect(changes()).toEqual([]);
    const given = await post(
      live.app,
      `${BASE}/cheers?perspective=DM`,
      { cheerId: ID(1), mark: 'applause' },
      TOKENS.dm,
    );
    expect(given.statusCode).toBe(204);
    await live.hub.cycle();
    expect(changes()).toHaveLength(1);
    player.disconnect();
    await live.app.close();
  });
});
