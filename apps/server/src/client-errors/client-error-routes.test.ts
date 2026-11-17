import type { ClientErrorsResponse, DisplayPairingResponse, SessionResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OPEN_WHEN_FINISHED } from '../ending/guard.ts';
import { liveRavenford, readyLive } from '../testing/live.ts';
import { ALL_SECRET_MARKERS, TOKENS, get, post, ravenfordApp } from '../testing/ravenford-app.ts';
import { signInTable } from '../testing/sign-in.ts';
import { REPORTS_PER_ADDRESS, buildLabel } from './client-error-routes.ts';

/**
 * Client error reports (docs/adr/0073-table-ideas.md §1): anyone who can load the page sends one;
 * a campaign is believed only for a member of it; the DM alone reads their campaign's list; a
 * report is fixed fields and nothing else.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const REPORT = {
  kind: 'render',
  name: 'TypeError',
  page: 'game',
  part: 'chat',
  browser: 'safari',
  browserVersion: 18,
  system: 'ios',
  shell: 'none',
  place: [{ file: 'index-B7xQ2a.js', line: 12, column: 3456 }],
} as const;

const send = (body: unknown, token?: string) => post(app, '/client-errors', body, token);
const listOf = async (token: string = TOKENS.dm) =>
  (await get(app, `${BASE}/client-errors`, token)).json<ClientErrorsResponse>().errors;

beforeEach(async () => {
  app = await ravenfordApp();
});

afterEach(async () => {
  await app.close();
});

describe('a client error report', () => {
  it('is taken from a player and the DM of the campaign it names, and read by the DM alone', async () => {
    expect(await listOf()).toEqual([]);
    expect((await send({ ...REPORT, campaignId: 'ravenford' }, TOKENS.player)).statusCode).toBe(
      204,
    );
    expect(
      (await send({ ...REPORT, campaignId: 'ravenford', part: 'session' }, TOKENS.dm)).statusCode,
    ).toBe(204);
    const errors = await listOf();
    expect(errors.map((error) => [error.role, error.part, error.count])).toEqual(
      expect.arrayContaining([
        ['player', 'chat', 1],
        ['dm', 'session', 1],
      ]),
    );
    expect(errors).toHaveLength(2);
    const [first] = errors.filter((error) => error.role === 'player');
    expect(first).toMatchObject({ ...REPORT, role: 'player', build: 'unknown', count: 1 });
    expect(first?.errorId).toMatch(/^[0-9a-f]{32}$/);
    // Nobody else reads the list: the DM routes' 404, whoever asks.
    expect((await get(app, `${BASE}/client-errors`, TOKENS.player)).statusCode).toBe(404);
    expect((await get(app, `${BASE}/client-errors`, TOKENS.outsider)).statusCode).toBe(404);
    expect((await get(app, `${BASE}/client-errors`)).statusCode).toBe(401);
  });

  it('seen again is the same entry, counted', async () => {
    for (let index = 0; index < 3; index += 1) {
      await send({ ...REPORT, campaignId: 'ravenford' }, TOKENS.player);
    }
    const errors = await listOf();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.count).toBe(3);
  });

  it('is kept without a campaign for anyone who is not a member of the one it names', async () => {
    // Nobody signed in (the sign-in page broke), a stranger, a campaign that does not exist.
    expect((await send(REPORT)).statusCode).toBe(204);
    expect((await send({ ...REPORT, campaignId: 'ravenford' })).statusCode).toBe(204);
    expect((await send({ ...REPORT, campaignId: 'ravenford' }, TOKENS.outsider)).statusCode).toBe(
      204,
    );
    expect((await send({ ...REPORT, campaignId: 'no-such-table' }, TOKENS.dm)).statusCode).toBe(
      204,
    );
    // None of them reached the DM's list.
    expect(await listOf()).toEqual([]);
  });

  it('holds fixed fields only: anything else is refused', async () => {
    for (const body of [
      { ...REPORT, message: 'Cannot read properties of undefined (reading "secret")' },
      { ...REPORT, name: 'TheDmIsAFool' },
      { ...REPORT, page: 'somewhere' },
      { ...REPORT, part: 'a part of my own' },
      { ...REPORT, browser: 'netscape' },
      { ...REPORT, browserVersion: 18.5 },
      { ...REPORT, system: 'my phone' },
      { ...REPORT, place: [{ file: 'https://table.example/assets/index.js', line: 1, column: 1 }] },
      { ...REPORT, place: [{ file: 'a rude word.js', line: 1, column: 1 }] },
      { ...REPORT, place: [{ file: 'index.js', line: 1, column: 1, function: 'whisper' }] },
      { ...REPORT, place: Array.from({ length: 4 }, () => REPORT.place[0]) },
      { ...REPORT, campaignId: 'Not A Campaign' },
      { ...REPORT, role: 'dm' },
      { ...REPORT, build: 'mine' },
      { kind: 'render' },
      {},
    ]) {
      expect((await send(body, TOKENS.player)).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect(await listOf()).toEqual([]);
  });

  it('is refused past its size', async () => {
    const answer = await app.inject({
      method: 'POST',
      url: '/client-errors',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ ...REPORT, padding: 'x'.repeat(4000) }),
    });
    expect([400, 413]).toContain(answer.statusCode);
  });

  it('is limited by address, whoever sends', async () => {
    const statuses: number[] = [];
    for (let index = 0; index < REPORTS_PER_ADDRESS + 2; index += 1) {
      statuses.push(
        (await send({ ...REPORT, browserVersion: index, campaignId: 'ravenford' }, TOKENS.player))
          .statusCode,
      );
    }
    expect(statuses.filter((status) => status === 204)).toHaveLength(REPORTS_PER_ADDRESS);
    expect(statuses.slice(REPORTS_PER_ADDRESS)).toEqual([429, 429]);
    // A refused report is not read at all: not even a malformed one is answered 400.
    expect((await send({})).statusCode).toBe(429);
    // Another address still reports.
    const other = await app.inject({
      method: 'POST',
      url: '/client-errors',
      remoteAddress: '198.51.100.7',
      payload: REPORT,
    });
    expect(other.statusCode).toBe(204);
  });

  it('is cleared by the DM, and by nobody else', async () => {
    await send({ ...REPORT, campaignId: 'ravenford' }, TOKENS.player);
    const clear = (token?: string) => post(app, `${BASE}/client-errors/clear`, {}, token);
    expect((await clear(TOKENS.player)).statusCode).toBe(404);
    expect((await clear(TOKENS.outsider)).statusCode).toBe(404);
    expect((await clear()).statusCode).toBe(401);
    expect(await listOf()).toHaveLength(1);
    expect((await clear(TOKENS.dm)).statusCode).toBe(204);
    expect(await listOf()).toEqual([]);
  });

  it('says nothing of the world or of who sent it', async () => {
    await send({ ...REPORT, campaignId: 'ravenford' }, TOKENS.player);
    const text = (await get(app, `${BASE}/client-errors`, TOKENS.dm)).body;
    const identity = (await get(app, `${BASE}/session`, TOKENS.player)).json<SessionResponse>();
    for (const marker of [...ALL_SECRET_MARKERS, identity.actorId, 'elowen', 'Elowen']) {
      expect(text, marker).not.toContain(marker);
    }
  });

  it('can be cleared in a finished campaign: it is not play', () => {
    expect(OPEN_WHEN_FINISHED.has('/campaigns/:campaignId/client-errors/clear')).toBe(true);
  });
});

describe('a table display', () => {
  it('sends a report — its one write — and reads no list', async () => {
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
    // The display names no campaign: its pairing says which.
    const sent = await table.send(
      'POST',
      '/client-errors',
      { cookie },
      { ...REPORT, page: 'display', part: 'none' },
    );
    expect(sent.statusCode).toBe(204);
    const list = await table.send('GET', `${BASE}/client-errors`, { cookie: dm });
    expect(list.json<ClientErrorsResponse>().errors.map((error) => error.role)).toEqual([
      'display',
    ]);
    expect((await table.send('GET', `${BASE}/client-errors`, { cookie })).statusCode).toBe(404);
    // A signed-in member's session says which campaign too, and no other is believed.
    const elsewhere = await table.send(
      'POST',
      '/client-errors',
      { cookie: dm },
      { ...REPORT, campaignId: 'other-table' },
    );
    expect(elsewhere.statusCode).toBe(204);
    const after = await table.send('GET', `${BASE}/client-errors`, { cookie: dm });
    expect(after.json<ClientErrorsResponse>().errors).toHaveLength(1);
    await table.app.close();
  });
});

describe('a report and the live stream', () => {
  it('signals the DM and no player', async () => {
    const live = await liveRavenford();
    const url = (query: string) => `${BASE}/live?${query}`;
    const dm = await readyLive(live.app, url('perspective=DM'), TOKENS.dm);
    const player = await readyLive(live.app, url('perspective=PLAYER'), TOKENS.player);
    const changes = (stream: typeof dm) =>
      stream.messages().filter((message) => message.type === 'changed');
    // The player's arrival is news to the DM (presence): what counts is what follows.
    await live.hub.cycle();
    await live.hub.cycle();
    const before = { dm: changes(dm).length, player: changes(player).length };
    const sent = await post(
      live.app,
      '/client-errors',
      { ...REPORT, campaignId: 'ravenford' },
      TOKENS.player,
    );
    expect(sent.statusCode).toBe(204);
    await live.hub.cycle();
    expect(changes(dm)).toHaveLength(before.dm + 1);
    expect(changes(player)).toHaveLength(before.player);
    dm.disconnect();
    player.disconnect();
    await live.app.close();
  });
});

describe('the build a report carries', () => {
  it('is the revision when it is plain, else unknown', () => {
    expect(buildLabel('eed5759496ea')).toBe('eed5759496ea');
    expect(buildLabel(undefined)).toBe('unknown');
    expect(buildLabel('')).toBe('unknown');
    expect(buildLabel('a revision with spaces')).toBe('unknown');
  });
});
