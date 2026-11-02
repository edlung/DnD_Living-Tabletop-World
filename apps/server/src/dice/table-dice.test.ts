import type { CheckRequestsResponse, RollEntry, RollFeedResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  TOKENS,
  get,
  post,
  ravenfordApp,
  seededEngine,
  testAiGateway,
  testAssets,
  testAuthoring,
  testDm,
} from '../testing/ravenford-app.ts';
import type { DiceSource } from './table-rolls.ts';
import { InMemoryRestStore, InMemoryTableStore } from './table-store.ts';

/**
 * The players' own dice and a roll between the DM and one player (docs/adr/0044-online-play.md
 * §4): faces entered only where the campaign's dice are the players' own (the DM's always), checked
 * against the dice and every total still the server's; the DM's word on an entered roll; a roll,
 * or a check asked, that only the DM and one player see.
 */
const server: DiceSource = {
  roll: () => {
    throw new Error('the server rolled where faces were entered');
  },
};
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';
const BRANN = 'brann-ironvale';
const rollAs = (perspective: string, body: unknown, token: string) =>
  post(app, `${BASE}/rolls?perspective=${perspective}`, body, token);
const feed = async (perspective: string, token: string) =>
  (await get(app, `${BASE}/rolls?perspective=${perspective}`, token)).json<RollFeedResponse>()
    .rolls;
const dice = (faces: number[], extra: object = {}) => ({
  kind: 'dice',
  dice: [{ count: 2, sides: 6 }],
  modifier: 1,
  faces,
  ...extra,
});
const physical = (on: boolean) =>
  post(app, `${BASE}/lobby?perspective=DM`, { dice: on ? 'physical' : 'app' }, TOKENS.dm);

beforeAll(async () => {
  let tick = 0;
  app = await ravenfordApp(
    await seededEngine(),
    testAiGateway(),
    testAuthoring(),
    testAssets().contents,
    testDm(),
    {
      store: new InMemoryTableStore(),
      rests: new InMemoryRestStore(),
      dice: server,
      now: () => new Date(Date.UTC(2030, 0, 1, 0, 0, (tick += 1))).toISOString(),
    },
  );
});
afterAll(async () => {
  await app.close();
});

describe('the players’ own dice', () => {
  it('takes a player’s faces only where the campaign’s dice are theirs, the DM’s always', async () => {
    expect((await rollAs('PLAYER', dice([3, 5]), TOKENS.player)).statusCode).toBe(409);
    const dm = await rollAs('DM', dice([6, 6]), TOKENS.dm);
    expect(dm.statusCode).toBe(201);
    expect(dm.json<{ roll: RollEntry }>().roll).toMatchObject({ entered: true });
    expect((await physical(true)).statusCode).toBe(204);
    const response = await rollAs('PLAYER', dice([3, 5]), TOKENS.player);
    expect(response.statusCode).toBe(201);
    const { roll } = response.json<{ roll: RollEntry }>();
    expect(roll).toMatchObject({
      entered: true,
      groups: [
        {
          dice: [
            { sides: 6, value: 3 },
            { sides: 6, value: 5 },
          ],
          total: 9,
        },
      ],
    });
    expect(roll.confirmed).toBeUndefined();
  });

  it('refuses faces that do not fit the dice: too few, too many, off a die', async () => {
    await physical(true);
    for (const faces of [[3], [3, 5, 2], [3, 7], [0, 2]]) {
      expect((await rollAs('PLAYER', dice(faces), TOKENS.player)).statusCode).toBe(400);
    }
    // A check with Advantage takes two d20s and keeps the higher, by the sheet's modifier.
    const check = await rollAs(
      'PLAYER',
      {
        kind: 'check',
        characterId: ELOWEN,
        check: { kind: 'save', ability: 'dex' },
        mode: 'advantage',
        faces: [4, 17],
      },
      TOKENS.player,
    );
    expect(check.statusCode).toBe(201);
    const [group] = check.json<{ roll: RollEntry }>().roll.groups;
    expect(group?.dice).toEqual([
      { sides: 20, value: 4, dropped: true },
      { sides: 20, value: 17 },
    ]);
    expect(group?.total).toBe(17 + (group?.modifier ?? 0));
    const one = await rollAs(
      'PLAYER',
      {
        kind: 'check',
        characterId: ELOWEN,
        check: { kind: 'save', ability: 'dex' },
        mode: 'advantage',
        faces: [12],
      },
      TOKENS.player,
    );
    expect(one.statusCode).toBe(400);
  });

  it('lets the DM confirm an entered roll, once, and only an entered one', async () => {
    await physical(true);
    const entered = (await rollAs('PLAYER', dice([2, 2]), TOKENS.player)).json<{
      roll: RollEntry;
    }>().roll;
    const id = entered.rollId.replace(/^table:/, '');
    const confirm = (rollId: string, token: string, perspective = 'DM') =>
      post(app, `${BASE}/rolls/${rollId}/confirm?perspective=${perspective}`, {}, token);
    expect((await confirm(id, TOKENS.player, 'PLAYER')).statusCode).toBe(403);
    expect((await confirm(id, TOKENS.dm)).statusCode).toBe(200);
    expect((await confirm(id, TOKENS.dm)).statusCode).toBe(200);
    const seen = (await feed('PLAYER', TOKENS.player)).find(
      (roll) => roll.rollId === entered.rollId,
    );
    expect(seen).toMatchObject({ entered: true, confirmed: true });
    expect((await confirm('00000000-0000-4000-8000-000000000999', TOKENS.dm)).statusCode).toBe(404);
  });
});

describe('a roll between the DM and one player', () => {
  it('shows a player’s private roll to the DM and that player only', async () => {
    await physical(true);
    const mine = (await rollAs('PLAYER', dice([1, 1], { private: true }), TOKENS.player)).json<{
      roll: RollEntry;
    }>().roll;
    expect(mine.private).toBe(true);
    expect((await feed('DM', TOKENS.dm)).map((roll) => roll.rollId)).toContain(mine.rollId);
    expect((await feed('PLAYER', TOKENS.player)).map((roll) => roll.rollId)).toContain(mine.rollId);
    // The party's view (the table's screen) does not see it.
    expect((await feed('PARTY', TOKENS.player)).map((roll) => roll.rollId)).not.toContain(
      mine.rollId,
    );
  });

  it('shows the DM’s roll to the one character it is for', async () => {
    await physical(true);
    const toBrann = (await rollAs('DM', dice([4, 4], { shownTo: BRANN }), TOKENS.dm)).json<{
      roll: RollEntry;
    }>().roll;
    const toElowen = (await rollAs('DM', dice([5, 5], { shownTo: ELOWEN }), TOKENS.dm)).json<{
      roll: RollEntry;
    }>().roll;
    const elowenSees = (await feed('PLAYER', TOKENS.player)).map((roll) => roll.rollId);
    expect(elowenSees).toContain(toElowen.rollId);
    expect(elowenSees).not.toContain(toBrann.rollId);
    // A player cannot show a roll to someone, nor can the DM hide one and show it.
    expect(
      (await rollAs('PLAYER', dice([1, 2], { shownTo: BRANN }), TOKENS.player)).statusCode,
    ).toBe(400);
    expect(
      (await rollAs('DM', dice([1, 2], { shownTo: BRANN, hidden: true }), TOKENS.dm)).statusCode,
    ).toBe(400);
  });

  it('answers a check asked in private privately, and the party’s list leaves it out', async () => {
    const asked = await post(
      app,
      `${BASE}/check-requests?perspective=DM`,
      {
        characterId: ELOWEN,
        check: { kind: 'skill', skill: 'perception' },
        mode: 'normal',
        private: true,
      },
      TOKENS.dm,
    );
    expect(asked.statusCode).toBe(201);
    const { request } = asked.json<{ request: { requestId: string; private?: true } }>();
    expect(request.private).toBe(true);
    const party = (
      await get(app, `${BASE}/check-requests?perspective=PARTY`, TOKENS.player)
    ).json<CheckRequestsResponse>();
    expect(party.requests.map((entry) => entry.requestId)).not.toContain(request.requestId);
    await physical(true);
    const answer = (
      await rollAs(
        'PLAYER',
        {
          kind: 'check',
          characterId: ELOWEN,
          check: { kind: 'skill', skill: 'perception' },
          mode: 'normal',
          requestId: request.requestId,
          faces: [11],
        },
        TOKENS.player,
      )
    ).json<{ roll: RollEntry }>().roll;
    expect(answer.private).toBe(true);
    expect((await feed('PARTY', TOKENS.player)).map((roll) => roll.rollId)).not.toContain(
      answer.rollId,
    );
  });
});
