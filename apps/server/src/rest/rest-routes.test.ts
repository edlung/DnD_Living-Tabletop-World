import { randomUUID } from 'node:crypto';

import type {
  CharacterSheet,
  CharacterSheetResponse,
  RestResponse,
  RollFeedResponse,
} from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import type { DiceSource } from '../dice/table-rolls.ts';
import { InMemoryRestStore, InMemoryTableStore } from '../dice/table-store.ts';
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
let engine: WorldEngine;
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

const call = (path: string, body: object, token: string, perspective = 'DM') =>
  post(app, `${BASE}/${path}?perspective=${perspective}`, body, token);
const state = async () => (await engine.load('ravenford'))?.state;
const sheetOf = async () => (await state())?.characterSheets.get(ELOWEN) as CharacterSheet;
const restView = async () =>
  (await get(app, `${BASE}/rest?perspective=PLAYER`, TOKENS.player)).json<RestResponse>();
const dmCommand = (command: object) =>
  engine.execute({ campaignId: 'ravenford', commandId: randomUUID(), actor: DM, command });
const hurt = async (current: number, extra: Partial<CharacterSheet> = {}) => {
  const sheet = await sheetOf();
  const next = { ...sheet, ...extra, hitPoints: { ...sheet.hitPoints, current } };
  await dmCommand({ type: 'SetCharacterSheet', entityId: ELOWEN, sheet: next });
};

beforeAll(async () => {
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
      now: () => new Date().toISOString(),
    },
  );
});
afterAll(async () => {
  await app.close();
});

describe('rests and levels at the table (Stage 530)', () => {
  it('lets only the DM call a rest; a short one passes an hour and opens for the table once', async () => {
    const requestId = randomUUID();
    const refused = await call('rest', { requestId, kind: 'short' }, TOKENS.player, 'PLAYER');
    expect(refused.statusCode).toBe(403);
    expect((await restView()).rest).toBeNull();
    const before = (await state())?.clock ?? 0;
    const opened = await call('rest', { requestId, kind: 'short' }, TOKENS.dm);
    expect(opened.statusCode).toBe(201);
    expect(opened.json()).toEqual({ status: 'resting' });
    expect((await state())?.clock).toBe(before + 3600);
    expect((await restView()).rest).toMatchObject({ restId: requestId, kind: 'short' });
    // The same request again (a lost answer) rests no second time; another one conflicts.
    expect((await call('rest', { requestId, kind: 'short' }, TOKENS.dm)).json()).toEqual({
      status: 'duplicate',
    });
    expect((await state())?.clock).toBe(before + 3600);
    const second = await call('rest', { requestId: randomUUID(), kind: 'short' }, TOKENS.dm);
    expect(second.statusCode).toBe(409);
  });

  it('heals by a Hit Point Die the server rolls, for the character’s own player', async () => {
    await hurt(40);
    queue.push(7);
    const requestId = randomUUID();
    const body = { requestId, characterId: ELOWEN, sides: 10 };
    const spent = await call('rest/hit-die', body, TOKENS.player, 'PLAYER');
    expect(spent.statusCode).toBe(201);
    // 7 on the d10 plus Constitution +2.
    expect(spent.json()).toEqual({ status: 'healed', healed: 9 });
    expect((await sheetOf()).hitPoints.current).toBe(49);
    expect((await sheetOf()).hitDiceSpent).toEqual({ d10: 1 });
    expect((await call('rest/hit-die', body, TOKENS.player, 'PLAYER')).json()).toEqual({
      status: 'duplicate',
    });
    const read = await get(
      app,
      `${BASE}/entities/${ELOWEN}/sheet?perspective=PLAYER`,
      TOKENS.player,
    );
    expect(read.json<CharacterSheetResponse>().derived?.hitDice).toEqual([
      { sides: 10, total: 7, left: 6 },
      { sides: 6, total: 8, left: 8 },
    ]);
    const feed = await get(app, `${BASE}/rolls?perspective=DM`, TOKENS.dm);
    expect(feed.json<RollFeedResponse>().rolls.at(-1)).toMatchObject({
      roller: { entityId: ELOWEN },
      subject: { kind: 'hit-die' },
      groups: [{ purpose: 'hit-die', dice: [{ sides: 10, value: 7 }], modifier: 2, total: 9 }],
    });
  });

  it('keeps the roll’s own ID, whatever request ID the client sends', async () => {
    await hurt(50);
    queue.push(4);
    const [someone] = (
      await get(app, `${BASE}/rolls?perspective=PLAYER`, TOKENS.player)
    ).json<RollFeedResponse>().rolls;
    const taken = someone?.rollId.replace(/^table:/, '') ?? randomUUID();
    const body = { requestId: taken, characterId: ELOWEN, sides: 10 };
    expect((await call('rest/hit-die', body, TOKENS.player, 'PLAYER')).statusCode).toBe(201);
    const rolls = (
      await get(app, `${BASE}/rolls?perspective=DM`, TOKENS.dm)
    ).json<RollFeedResponse>().rolls;
    expect(rolls.filter((roll) => roll.subject.kind === 'hit-die')).toHaveLength(2);
  });

  it('heals at least 1 and never past the maximum, and refuses another character or full health', async () => {
    await hurt(77);
    queue.push(1);
    const body = { requestId: randomUUID(), characterId: ELOWEN, sides: 6 };
    expect((await call('rest/hit-die', body, TOKENS.player, 'PLAYER')).json()).toEqual({
      status: 'healed',
      healed: 1,
    });
    const full = { requestId: randomUUID(), characterId: ELOWEN, sides: 6 };
    expect((await call('rest/hit-die', full, TOKENS.player, 'PLAYER')).statusCode).toBe(422);
    const other = { requestId: randomUUID(), characterId: 'mira-vale', sides: 6 };
    expect((await call('rest/hit-die', other, TOKENS.player, 'PLAYER')).statusCode).toBe(403);
    const odd = { requestId: randomUUID(), characterId: ELOWEN, sides: 20 };
    expect((await call('rest/hit-die', odd, TOKENS.player, 'PLAYER')).statusCode).toBe(400);
  });

  it('ends the short rest at the DM’s word; no Hit Point Die is spent after it', async () => {
    expect(
      (await call('rest/end', { requestId: randomUUID() }, TOKENS.player, 'PLAYER')).statusCode,
    ).toBe(403);
    expect((await call('rest/end', { requestId: randomUUID() }, TOKENS.dm)).json()).toEqual({
      status: 'ended',
    });
    expect((await restView()).rest).toBeNull();
    await hurt(30);
    const late = { requestId: randomUUID(), characterId: ELOWEN, sides: 10 };
    expect((await call('rest/hit-die', late, TOKENS.player, 'PLAYER')).statusCode).toBe(409);
    expect((await call('rest/end', { requestId: randomUUID() }, TOKENS.dm)).statusCode).toBe(409);
  });

  it('gives everything back in a long rest of eight hours', async () => {
    const sheet = await sheetOf();
    await hurt(0, {
      conditions: ['unconscious'],
      deathSaves: { successes: 1, failures: 2 },
      spellSlots: { max: sheet.spellSlots.max, expended: [2, 1, 0, 0, 0, 0, 0, 0, 0] },
    });
    const before = (await state())?.clock ?? 0;
    const rested = await call('rest', { requestId: randomUUID(), kind: 'long' }, TOKENS.dm);
    expect(rested.statusCode).toBe(201);
    expect((await state())?.clock).toBe(before + 8 * 3600);
    const after = await sheetOf();
    expect(after.hitPoints).toEqual({ max: 78, current: 78 });
    expect(after.spellSlots.expended.every((used) => used === 0)).toBe(true);
    expect(after.conditions).not.toContain('unconscious');
    expect(after.deathSaves).toBeUndefined();
    expect(after.hitDiceSpent).toBeUndefined();
  });

  it('grants a milestone level the rules compute, at the DM’s word only', async () => {
    const body = { requestId: randomUUID(), classId: 'wizard' };
    const path = `characters/${ELOWEN}/level-up`;
    expect((await call(path, body, TOKENS.player, 'PLAYER')).statusCode).toBe(403);
    expect((await call(path, body, TOKENS.dm)).json()).toEqual({ status: 'levelled' });
    expect((await call(path, body, TOKENS.dm)).json()).toEqual({ status: 'duplicate' });
    const after = await sheetOf();
    expect(after.classes).toContainEqual(expect.objectContaining({ classId: 'wizard', level: 9 }));
    // A d6 level: 4 plus Constitution +2.
    expect(after.hitPoints).toEqual({ max: 84, current: 84 });
    // Caster level 13 (wizard 9 + ranger 7 halved, rounded up): a 7th-level slot.
    expect(after.spellSlots.max).toEqual([4, 3, 3, 3, 2, 1, 1, 0, 0]);
    const wrong = { requestId: randomUUID(), classId: 'ranger', extra: true };
    expect((await call(path, wrong, TOKENS.dm)).statusCode).toBe(400);
  });

  it('rests no one in a fight, and shows no open rest while one runs', async () => {
    await call('rest', { requestId: randomUUID(), kind: 'short' }, TOKENS.dm);
    for (const command of ambush.place) await dmCommand(command);
    await dmCommand(ambush.startCombat);
    expect((await state())?.encounter).not.toBeNull();
    expect((await restView()).rest).toBeNull();
    const long = await call('rest', { requestId: randomUUID(), kind: 'long' }, TOKENS.dm);
    expect(long.statusCode).toBe(409);
    const die = { requestId: randomUUID(), characterId: ELOWEN, sides: 10 };
    expect((await call('rest/hit-die', die, TOKENS.player, 'PLAYER')).statusCode).toBe(409);
  });
});
