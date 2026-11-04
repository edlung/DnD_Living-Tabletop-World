import type { CheckRequestsResponse, RollEntry, RollFeedResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ALL_SECRET_MARKERS,
  ASHEN_CIRCLE_ID,
  TOKENS,
  get,
  post,
  ravenfordApp,
  seededEngine,
  testAiGateway,
  testAuthoring,
  testAssets,
  testDm,
} from '../testing/ravenford-app.ts';
import type { DiceSource } from './table-rolls.ts';
import { InMemoryRestStore, InMemoryTableStore } from './table-store.ts';

/** The table's dice, scripted: each test queues the faces it expects. */
const queue: number[] = [];
const dice: DiceSource = {
  roll: (sides) => {
    const value = queue.shift();
    if (value === undefined || value > sides) throw new Error(`no scripted d${String(sides)}`);
    return value;
  },
};
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';
const feed = async (perspective: string, token: string) =>
  (await get(app, `${BASE}/rolls?perspective=${perspective}`, token)).json<RollFeedResponse>();
const rollAs = (perspective: string, body: unknown, token: string) =>
  post(app, `${BASE}/rolls?perspective=${perspective}`, body, token);

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
      dice,
      now: () => new Date(Date.UTC(2030, 0, 1, 0, 0, (tick += 1))).toISOString(),
    },
  );
});
afterAll(async () => {
  await app.close();
});

describe('the table rolls (Stage 510)', () => {
  it('rolls a player’s free dice on the server and shows them to the table', async () => {
    queue.push(3, 5);
    const response = await rollAs(
      'PLAYER',
      { kind: 'dice', dice: [{ count: 2, sides: 6 }], modifier: 1 },
      TOKENS.player,
    );
    expect(response.statusCode).toBe(201);
    const { roll } = response.json<{ roll: RollEntry }>();
    expect(roll).toMatchObject({
      roller: { entityId: ELOWEN, name: 'Elowen Starwhisper' },
      subject: { kind: 'dice' },
      hidden: false,
      groups: [
        {
          purpose: 'dice',
          dice: [
            { sides: 6, value: 3 },
            { sides: 6, value: 5 },
          ],
          modifier: 1,
          total: 9,
        },
      ],
    });
    expect((await feed('PLAYER', TOKENS.player)).rolls.at(-1)?.rollId).toBe(roll.rollId);
    expect((await feed('DM', TOKENS.dm)).rolls.map((entry) => entry.rollId)).toContain(roll.rollId);
  });

  it('refuses a player’s hidden roll and a roll for someone else', async () => {
    const hidden = { kind: 'dice', dice: [{ count: 1, sides: 20 }], modifier: 0, hidden: true };
    expect((await rollAs('PLAYER', hidden, TOKENS.player)).statusCode).toBe(400);
    const other = {
      kind: 'dice',
      characterId: 'mira-vale',
      dice: [{ count: 1, sides: 4 }],
      modifier: 0,
    };
    expect((await rollAs('PLAYER', other, TOKENS.player)).statusCode).toBe(403);
    const check = {
      kind: 'check',
      characterId: 'mira-vale',
      check: { kind: 'skill', skill: 'athletics' },
      mode: 'normal',
    };
    expect((await rollAs('PLAYER', check, TOKENS.player)).statusCode).toBe(403);
    expect(
      (await rollAs('PLAYER', { kind: 'dice', dice: [], modifier: 0 }, TOKENS.player)).statusCode,
    ).toBe(400);
  });

  it('takes a check’s bonus from the canonical sheet, with Advantage keeping the higher d20', async () => {
    queue.push(7, 15);
    const response = await rollAs(
      'PLAYER',
      {
        kind: 'check',
        characterId: ELOWEN,
        check: { kind: 'skill', skill: 'perception' },
        mode: 'advantage',
      },
      TOKENS.player,
    );
    expect(response.statusCode).toBe(201);
    // Perception: Wisdom +2, expertise twice the proficiency bonus (+5) = +12.
    expect(response.json<{ roll: RollEntry }>().roll).toMatchObject({
      subject: { kind: 'skill', skill: 'perception' },
      groups: [
        {
          purpose: 'check',
          dice: [
            { sides: 20, value: 7, dropped: true },
            { sides: 20, value: 15 },
          ],
          modifier: 12,
          total: 27,
        },
      ],
    });
  });

  it('keeps the DM’s hidden roll from the players', async () => {
    queue.push(18);
    const response = await rollAs(
      'DM',
      { kind: 'dice', dice: [{ count: 1, sides: 20 }], modifier: 0, hidden: true },
      TOKENS.dm,
    );
    expect(response.statusCode).toBe(201);
    const { roll } = response.json<{ roll: RollEntry }>();
    expect(roll).toMatchObject({ roller: null, hidden: true });
    expect((await feed('DM', TOKENS.dm)).rolls.map((entry) => entry.rollId)).toContain(roll.rollId);
    expect((await feed('PLAYER', TOKENS.player)).rolls.map((entry) => entry.rollId)).not.toContain(
      roll.rollId,
    );
  });

  it('lets the DM ask for a check with a hidden DC that only the DM sees beaten', async () => {
    const asked = await post(
      app,
      `${BASE}/check-requests?perspective=DM`,
      { characterId: ELOWEN, check: { kind: 'save', ability: 'dex' }, mode: 'normal', dc: 15 },
      TOKENS.dm,
    );
    expect(asked.statusCode).toBe(201);
    const requests = (
      await get(app, `${BASE}/check-requests?perspective=PLAYER`, TOKENS.player)
    ).json<CheckRequestsResponse>().requests;
    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request).toMatchObject({
      characterId: ELOWEN,
      status: 'open',
      check: { kind: 'save', ability: 'dex' },
    });
    expect(request).not.toHaveProperty('dc');
    // The request's check and mode win over what the answer names.
    queue.push(10);
    const answer = {
      kind: 'check',
      characterId: ELOWEN,
      check: { kind: 'skill', skill: 'stealth' },
      mode: 'advantage',
      requestId: request?.requestId,
    };
    const rolled = await rollAs('PLAYER', answer, TOKENS.player);
    expect(rolled.statusCode).toBe(201);
    // Dexterity save: +4 and proficiency +5 = +9.
    expect(rolled.json<{ roll: RollEntry }>().roll.groups[0]).toEqual({
      purpose: 'save',
      dice: [{ sides: 20, value: 10 }],
      modifier: 9,
      total: 19,
    });
    expect((await rollAs('PLAYER', answer, TOKENS.player)).statusCode).toBe(409);
    const dm = (
      await get(app, `${BASE}/check-requests?perspective=DM`, TOKENS.dm)
    ).json<CheckRequestsResponse>();
    expect(dm.requests[0]).toMatchObject({ status: 'rolled', dc: 15, total: 19, success: true });
    const player = (
      await get(app, `${BASE}/check-requests?perspective=PLAYER`, TOKENS.player)
    ).json<CheckRequestsResponse>();
    expect(player.requests).toEqual([]);
  });

  it('asks several characters at once as one group (ADR 0043 §1)', async () => {
    const group = {
      characterIds: [ELOWEN, 'brann-ironvale'],
      check: { kind: 'skill', skill: 'perception' },
      mode: 'normal',
      dc: 13,
    };
    const asked = await post(app, `${BASE}/check-requests?perspective=DM`, group, TOKENS.dm);
    expect(asked.statusCode).toBe(201);
    const made = asked.json<{ groupId: string; requests: CheckRequestsResponse['requests'] }>();
    expect(made.requests.map((request) => [request.characterId, request.groupId])).toEqual([
      [ELOWEN, made.groupId],
      ['brann-ironvale', made.groupId],
    ]);
    // Elowen's player sees her own request only, without the DC.
    const mine = (
      await get(app, `${BASE}/check-requests?perspective=PLAYER`, TOKENS.player)
    ).json<CheckRequestsResponse>().requests;
    expect(mine.map((request) => request.characterId)).toEqual([ELOWEN]);
    expect(mine[0]).not.toHaveProperty('dc');
    const again = (ids: readonly string[]) =>
      post(
        app,
        `${BASE}/check-requests?perspective=DM`,
        { ...group, characterIds: ids },
        TOKENS.dm,
      );
    expect((await again([ELOWEN, ELOWEN])).statusCode).toBe(422);
    expect((await again([ELOWEN, 'mira-vale'])).statusCode).toBe(422);
    expect((await again(Array.from({ length: 9 }, () => ELOWEN))).statusCode).toBe(400);
  });

  it('keeps requests the DM’s and answers others in the usual order', async () => {
    const body = {
      characterId: ELOWEN,
      check: { kind: 'ability', ability: 'str' },
      mode: 'normal',
    };
    expect(
      (await post(app, `${BASE}/check-requests?perspective=PLAYER`, body, TOKENS.player))
        .statusCode,
    ).toBe(403);
    expect((await post(app, `${BASE}/check-requests?perspective=DM`, body)).statusCode).toBe(401);
    expect(
      (await post(app, `${BASE}/check-requests?perspective=DM`, body, TOKENS.outsider)).statusCode,
    ).toBe(404);
    expect(
      (
        await post(
          app,
          `${BASE}/check-requests?perspective=DM`,
          { ...body, characterId: 'mira-vale' },
          TOKENS.dm,
        )
      ).statusCode,
    ).toBe(422);
  });

  it('shows a player only its own world rolls, and nothing secret', async () => {
    const response = await get(app, `${BASE}/rolls?perspective=PLAYER`, TOKENS.player);
    const { rolls } = response.json<RollFeedResponse>();
    for (const entry of rolls) {
      expect(entry.hidden).toBe(false);
      expect([null, ELOWEN]).toContain(entry.roller?.entityId ?? null);
    }
    expect(response.body).not.toContain(ASHEN_CIRCLE_ID);
    expect(ALL_SECRET_MARKERS.filter((marker) => response.body.includes(marker))).toEqual([]);
  });
});

describe('a character’s conditions on the table’s rolls (docs/adr/0045-conditions-and-actions.md §1)', () => {
  const setCondition = (condition: string, applied: boolean) =>
    post(
      app,
      `${BASE}/commands`,
      {
        commandId: `condition-${condition}-${String(applied)}`,
        command: { type: 'SetCondition', targetId: ELOWEN, condition, applied, reason: 'A test' },
      },
      TOKENS.dm,
    );
  const check = (body: object) =>
    rollAs(
      'PLAYER',
      { kind: 'check', characterId: ELOWEN, mode: 'normal', ...body },
      TOKENS.player,
    );

  it('rolls a Poisoned character’s check with Disadvantage, and tells the player beforehand', async () => {
    expect((await setCondition('poisoned', true)).statusCode).toBe(200);
    const requests = (
      await get(app, `${BASE}/check-requests?perspective=PLAYER`, TOKENS.player)
    ).json<CheckRequestsResponse>();
    expect(requests.d20?.checks).toEqual({
      normal: 'disadvantage',
      advantage: 'normal',
      disadvantage: 'disadvantage',
    });
    queue.push(15, 4);
    const rolled = await check({ check: { kind: 'skill', skill: 'perception' } });
    expect(rolled.statusCode).toBe(201);
    expect(rolled.json<{ roll: RollEntry }>().roll.groups[0]?.dice).toEqual([
      { sides: 20, value: 15, dropped: true },
      { sides: 20, value: 4 },
    ]);
    expect((await setCondition('poisoned', false)).statusCode).toBe(200);
    // The DM's view carries no character's lookups.
    const dm = (
      await get(app, `${BASE}/check-requests?perspective=DM`, TOKENS.dm)
    ).json<CheckRequestsResponse>();
    expect(dm.d20).toBeUndefined();
  });

  it('fails a Paralyzed character’s Dexterity save outright, its die kept for the log', async () => {
    expect((await setCondition('paralyzed', true)).statusCode).toBe(200);
    queue.push(18);
    const rolled = await check({ check: { kind: 'save', ability: 'dex' } });
    expect(rolled.json<{ roll: RollEntry }>().roll.groups[0]).toMatchObject({
      dice: [{ sides: 20, value: 18 }],
      result: 'failure',
      autoFail: true,
    });
    expect((await setCondition('paralyzed', false)).statusCode).toBe(200);
  });
});
