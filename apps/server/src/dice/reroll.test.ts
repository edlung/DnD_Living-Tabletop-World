import type {
  CharacterSheet,
  CheckRequestsResponse,
  RollEntry,
  RollFeedResponse,
  RollGroup,
} from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
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
import { rerollable } from './reroll.ts';
import { rerollCheck, type DiceSource } from './table-rolls.ts';
import { InMemoryRestStore, InMemoryTableStore, type TableRollRecord } from './table-store.ts';
import type { WorldRoll } from './world-rolls.ts';

/**
 * Heroic Inspiration on the table's checks (docs/adr/0046-reactions-beyond-counterspell.md §6):
 * the lower d20 of the player's latest check rolled again, the new roll counting — a request it
 * answered takes the new total — and the first kept in the log, rolled again; the inspiration
 * spent once through the World Engine. Elowen: Perception +12, Dexterity save +9.
 */
const queue: number[] = [];
const dice: DiceSource = {
  roll: (sides) => {
    const value = queue.shift();
    if (value === undefined || value > sides) throw new Error(`no scripted d${String(sides)}`);
    return value;
  },
};
const ELOWEN = 'elowen-starwhisper';
const BASE = '/campaigns/ravenford';
let app: FastifyInstance;
let engine: WorldEngine;
let commands = 0;

beforeAll(async () => {
  let tick = 0;
  engine = await seededEngine();
  app = await ravenfordApp(
    engine,
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

const sheet = async () => (await engine.load('ravenford'))?.state.characterSheets.get(ELOWEN);
const dmCommand = async (command: object) => {
  commands += 1;
  const response = await post(
    app,
    `${BASE}/commands`,
    { commandId: `reroll-test-${String(commands)}`, command },
    TOKENS.dm,
  );
  expect(response.statusCode).toBe(200);
};
/** Gives Elowen Heroic Inspiration, unless she holds it. */
async function inspire() {
  if ((await sheet())?.heroicInspiration === true) return;
  await dmCommand({
    type: 'SetInspiration',
    characterId: ELOWEN,
    inspired: true,
    reason: 'A test',
  });
}
const setCondition = (condition: string, applied: boolean) =>
  dmCommand({ type: 'SetCondition', targetId: ELOWEN, condition, applied, reason: 'A test' });
const feed = async () =>
  (await get(app, `${BASE}/rolls?perspective=PLAYER`, TOKENS.player)).json<RollFeedResponse>();
async function check(body: object): Promise<RollEntry> {
  const response = await post(
    app,
    `${BASE}/rolls?perspective=PLAYER`,
    { kind: 'check', characterId: ELOWEN, mode: 'normal', ...body },
    TOKENS.player,
  );
  expect(response.statusCode).toBe(201);
  return response.json<{ roll: RollEntry }>().roll;
}
const perception = (mode = 'normal') =>
  check({ check: { kind: 'skill', skill: 'perception' }, mode });
const reroll = (rollId: string, body: object = {}, token: string = TOKENS.player) => {
  const perspective = token === TOKENS.dm ? 'DM' : 'PLAYER';
  const id = rollId.replace(/^table:/, '');
  return post(app, `${BASE}/rolls/${id}/reroll?perspective=${perspective}`, body, token);
};

describe('the lower d20 rolled again', () => {
  const group = (values: readonly number[], kept: number): RollGroup => ({
    purpose: 'check',
    dice: values.map((value, index) =>
      index === kept ? { sides: 20, value } : { sides: 20, value, dropped: true },
    ),
    modifier: 3,
    total: (values[kept] ?? 0) + 3,
  });
  const faces = (...values: number[]): DiceSource => ({
    roll: () => values.shift() ?? 0,
  });

  it('takes the new die alone, or beside the higher one with Advantage, the lower with Disadvantage', () => {
    expect(rerollCheck(faces(14), group([4], 0), 'normal')).toEqual({
      purpose: 'check',
      dice: [{ sides: 20, value: 14 }],
      modifier: 3,
      total: 17,
    });
    // Advantage, 7 and 15: the 7 is rolled again; the higher of 15 and the new die counts.
    expect(rerollCheck(faces(3), group([7, 15], 1), 'advantage')?.dice).toEqual([
      { sides: 20, value: 3, dropped: true },
      { sides: 20, value: 15 },
    ]);
    expect(rerollCheck(faces(18), group([7, 15], 1), 'advantage')?.total).toBe(21);
    // Disadvantage, 15 and 4: the 4 is rolled again; the lower of 15 and the new die counts.
    expect(rerollCheck(faces(12), group([15, 4], 1), 'disadvantage')).toMatchObject({
      dice: [
        { sides: 20, value: 15, dropped: true },
        { sides: 20, value: 12 },
      ],
      total: 15,
    });
    expect(rerollCheck(faces(19), group([4, 15], 0), 'disadvantage')?.total).toBe(18);
  });

  it('rolls nothing for a save failed outright, or dice that are not the mode’s', () => {
    expect(rerollCheck(faces(20), { ...group([18], 0), autoFail: true }, 'normal')).toBeNull();
    expect(rerollCheck(faces(20), group([7, 15], 1), 'normal')).toBeNull();
    expect(rerollCheck(faces(20), group([7], 0), 'advantage')).toBeNull();
  });
});

describe('which check a character may roll again', () => {
  const record = (
    rollId: string,
    at: number,
    changes: Partial<TableRollRecord> = {},
  ): TableRollRecord => ({
    rollId,
    campaignId: 'ravenford',
    rollerId: ELOWEN,
    subject: { kind: 'skill', skill: 'perception' },
    groups: [{ purpose: 'check', dice: [{ sides: 20, value: 5 }], modifier: 12, total: 17 }],
    hidden: false,
    entered: false,
    audienceId: null,
    requestId: null,
    at: new Date(Date.UTC(2030, 0, 1, 0, 0, at)).toISOString(),
    mode: 'normal',
    ...changes,
  });
  const worldRoll = (at: number, rollerId = ELOWEN): WorldRoll => ({
    rollId: `world:${String(at)}`,
    roller: { entityId: rollerId, name: null },
    subject: { kind: 'initiative' },
    groups: [],
    hidden: false,
    at: new Date(Date.UTC(2030, 0, 1, 0, 0, at)).toISOString(),
    rollerId,
    dmOnly: false,
  });
  let inspired: CharacterSheet;
  beforeAll(async () => {
    const seeded = await sheet();
    if (!seeded) throw new Error('Elowen has no sheet');
    inspired = { ...seeded, heroicInspiration: true };
  });

  it('is its own latest roll, a check, while it holds Heroic Inspiration', () => {
    const first = record('a', 1);
    const other = record('b', 2, { rollerId: 'brann-ironvale' });
    expect(rerollable([first, other], [], ELOWEN, inspired)?.roll.rollId).toBe('a');
    const plain = { ...inspired };
    delete plain.heroicInspiration;
    expect(rerollable([first], [], ELOWEN, plain)).toBeNull();
    const freeDice = record('c', 3, { subject: { kind: 'dice' } });
    expect(rerollable([first, freeDice], [], ELOWEN, inspired)).toBeNull();
  });

  it('is not once the World Engine rolled for it since, nor a save failed outright', () => {
    const first = record('a', 5);
    expect(rerollable([first], [worldRoll(4)], ELOWEN, inspired)).not.toBeNull();
    expect(rerollable([first], [worldRoll(6, 'brann-ironvale')], ELOWEN, inspired)).not.toBeNull();
    expect(rerollable([first], [worldRoll(6)], ELOWEN, inspired)).toBeNull();
    const failed = record('d', 7, {
      subject: { kind: 'save', ability: 'dex' },
      groups: [
        {
          purpose: 'save',
          dice: [{ sides: 20, value: 18 }],
          modifier: 9,
          total: 27,
          result: 'failure',
          autoFail: true,
        },
      ],
    });
    expect(rerollable([failed], [], ELOWEN, inspired)).toBeNull();
  });

  it('knows an older roll’s mode from a single die only', () => {
    const older = record('e', 8, { mode: null });
    expect(rerollable([older], [], ELOWEN, inspired)?.mode).toBe('normal');
    const twice = record('f', 9, {
      mode: null,
      groups: [
        {
          purpose: 'check',
          dice: [
            { sides: 20, value: 5, dropped: true },
            { sides: 20, value: 9 },
          ],
          modifier: 12,
          total: 21,
        },
      ],
    });
    expect(rerollable([twice], [], ELOWEN, inspired)).toBeNull();
  });
});

describe('a check rolled again at the table', () => {
  it('rolls the player’s latest check again; the first stays in the log, rolled again', async () => {
    await inspire();
    queue.push(5);
    const first = await perception();
    expect((await feed()).rerollable).toBe(first.rollId);
    queue.push(16);
    const response = await reroll(first.rollId);
    expect(response.statusCode).toBe(201);
    const again = response.json<{ roll: RollEntry }>().roll;
    expect(again).toMatchObject({
      rerollOf: first.rollId,
      subject: { kind: 'skill', skill: 'perception' },
      groups: [{ purpose: 'check', dice: [{ sides: 20, value: 16 }], modifier: 12, total: 28 }],
    });
    const after = await feed();
    expect(after.rerollable).toBeUndefined();
    expect(after.rolls.find((roll) => roll.rollId === first.rollId)?.rerolled).toBe(true);
    expect(after.rolls.find((roll) => roll.rollId === again.rollId)?.rerolled).toBeUndefined();
    expect((await sheet())?.heroicInspiration).toBeUndefined();
    // Nothing more to spend, and the first is no longer the latest.
    expect((await reroll(first.rollId)).statusCode).toBe(409);
    expect((await reroll(again.rollId)).statusCode).toBe(409);
  });

  it('keeps the mode the check was rolled in, its conditions counted', async () => {
    await inspire();
    queue.push(7, 15);
    const advantage = await perception('advantage');
    queue.push(18);
    expect((await reroll(advantage.rollId)).json<{ roll: RollEntry }>().roll.groups[0]).toEqual({
      purpose: 'check',
      dice: [
        { sides: 20, value: 18 },
        { sides: 20, value: 15, dropped: true },
      ],
      modifier: 12,
      total: 30,
    });
    // Poisoned: Disadvantage on the check, which its reroll keeps once the poison is gone.
    await inspire();
    await setCondition('poisoned', true);
    queue.push(15, 4);
    const poisoned = await perception();
    await setCondition('poisoned', false);
    queue.push(12);
    const again = (await reroll(poisoned.rollId)).json<{ roll: RollEntry }>().roll;
    expect(again.groups[0]?.dice).toEqual([
      { sides: 20, value: 15, dropped: true },
      { sides: 20, value: 12 },
    ]);
    expect(again.groups[0]?.total).toBe(24);
  });

  it('gives the request it answered the new total', async () => {
    const asked = await post(
      app,
      `${BASE}/check-requests?perspective=DM`,
      { characterId: ELOWEN, check: { kind: 'save', ability: 'dex' }, mode: 'normal', dc: 15 },
      TOKENS.dm,
    );
    const { requestId } = asked.json<{ request: { requestId: string } }>().request;
    await inspire();
    queue.push(3);
    const answer = await check({ check: { kind: 'save', ability: 'dex' }, requestId });
    const requests = async () =>
      (await get(app, `${BASE}/check-requests?perspective=DM`, TOKENS.dm))
        .json<CheckRequestsResponse>()
        .requests.find((request) => request.requestId === requestId);
    expect(await requests()).toMatchObject({ total: 12, success: false });
    queue.push(10);
    expect((await reroll(answer.rollId)).statusCode).toBe(201);
    expect(await requests()).toMatchObject({ status: 'rolled', total: 19, success: true });
  });

  it('refuses what Heroic Inspiration cannot roll again, and spends nothing then', async () => {
    const { heroicInspiration } = (await sheet()) ?? {};
    if (heroicInspiration === true) {
      await dmCommand({
        type: 'SetInspiration',
        characterId: ELOWEN,
        inspired: false,
        reason: 'A test',
      });
    }
    queue.push(9);
    const plain = await perception();
    expect((await feed()).rerollable).toBeUndefined();
    expect((await reroll(plain.rollId)).statusCode).toBe(409);
    await inspire();
    // A save Paralyzed fails outright: no die changes it.
    await setCondition('paralyzed', true);
    queue.push(18);
    const failed = await check({ check: { kind: 'save', ability: 'dex' } });
    await setCondition('paralyzed', false);
    expect((await reroll(failed.rollId)).statusCode).toBe(409);
    // Not the latest: free dice came after.
    queue.push(4);
    const latest = await perception();
    queue.push(2);
    const free = await post(
      app,
      `${BASE}/rolls?perspective=PLAYER`,
      { kind: 'dice', dice: [{ count: 1, sides: 4 }], modifier: 0 },
      TOKENS.player,
    );
    expect(free.statusCode).toBe(201);
    expect((await reroll(latest.rollId)).statusCode).toBe(409);
    // The DM's own roll is no character's; nobody else may see this campaign.
    queue.push(11);
    const dmRoll = await post(
      app,
      `${BASE}/rolls?perspective=DM`,
      { kind: 'dice', dice: [{ count: 1, sides: 20 }], modifier: 0 },
      TOKENS.dm,
    );
    expect((await reroll(dmRoll.json<{ roll: RollEntry }>().roll.rollId)).statusCode).toBe(404);
    expect((await reroll(latest.rollId, {}, TOKENS.outsider)).statusCode).toBe(404);
    expect((await reroll(latest.rollId, { extra: true })).statusCode).toBe(400);
    expect((await sheet())?.heroicInspiration).toBe(true);
  });

  it('reads the new die off the player’s own dice where the dice are theirs', async () => {
    await inspire();
    queue.push(6);
    const rolled = await perception();
    expect((await reroll(rolled.rollId, { faces: [14] })).statusCode).toBe(409);
    const lobby = (on: boolean) =>
      post(app, `${BASE}/lobby?perspective=DM`, { dice: on ? 'physical' : 'app' }, TOKENS.dm);
    expect((await lobby(true)).statusCode).toBe(204);
    expect((await reroll(rolled.rollId, { faces: [21] })).statusCode).toBe(400);
    expect((await reroll(rolled.rollId, { faces: [3, 4] })).statusCode).toBe(400);
    const entered = await reroll(rolled.rollId, { faces: [14] });
    expect(entered.statusCode).toBe(201);
    expect(entered.json<{ roll: RollEntry }>().roll).toMatchObject({
      entered: true,
      groups: [{ dice: [{ sides: 20, value: 14 }], total: 26 }],
    });
    expect((await lobby(false)).statusCode).toBe(204);
  });

  it('lets the DM roll a character’s check again with its inspiration', async () => {
    await inspire();
    queue.push(8);
    const rolled = await perception();
    queue.push(17);
    const response = await reroll(rolled.rollId, {}, TOKENS.dm);
    expect(response.statusCode).toBe(201);
    expect((await sheet())?.heroicInspiration).toBeUndefined();
  });
});
