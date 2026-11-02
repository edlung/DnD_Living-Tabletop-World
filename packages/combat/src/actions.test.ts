import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  PLAYER,
  RAIDER_1,
  RAIDER_2,
  RAIDER_3,
  SHAMAN,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';

/**
 * The actions beside Attack and Magic (docs/adr/0045-conditions-and-actions.md §5), through the
 * World Engine. Elowen stands at (2,6), the order is Elowen, the Shaman, then Raiders 1–3.
 */
const act = (combatantId: string, action: string, extra: Record<string, unknown> = {}) => ({
  type: 'TakeAction',
  combatantId,
  action,
  ...extra,
});
const message = (result: Awaited<ReturnType<RoadWorld['submit']>>) =>
  result.status === 'rejected' ? result.message : result.status;
const turnOf = async (world: RoadWorld, entityId: string) =>
  (await world.encounter()).combatants.find((c) => c.entityId === entityId)?.turn;
/** Squares east along row 8, past the Raiders: twelve of them are 60 ft. */
const eastward = (count: number) => [
  { x: 3, y: 7 },
  ...Array.from({ length: count - 1 }, (_, i) => ({ x: 4 + i, y: 8 })),
];

describe('the actions', () => {
  it('Dash adds the Speed once more, and an action is spent once a turn', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const far = { type: 'MoveCombatant', combatantId: ELOWEN, path: eastward(12) };
    expect(message(await world.submit(far, PLAYER))).toBe('NOT_ENOUGH_MOVEMENT');
    expect(codeOf(await world.submit(act(ELOWEN, 'dash'), PLAYER))).toBe('accepted');
    expect((await turnOf(world, ELOWEN))?.dashFt).toBe(30);
    expect(codeOf(await world.submit(far, PLAYER))).toBe('accepted');
    expect(message(await world.submit(act(ELOWEN, 'dodge'), PLAYER))).toBe('NO_ACTION');
  });

  it('Dodge gives attacks against the dodger Disadvantage until its next turn', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    expect(codeOf(await world.submit(act(ELOWEN, 'dodge'), PLAYER))).toBe('accepted');
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
    await world.dm({ type: 'EndTurn', combatantId: SHAMAN });
    world.roll(20, 15, 15);
    const shot = await world.dm({
      type: 'Attack',
      combatantId: RAIDER_1,
      attackId: 'shortbow',
      targetId: ELOWEN,
    });
    const performed = (await recorded(world, shot)).find((e) => e.type === 'AttackPerformed');
    expect(performed?.type === 'AttackPerformed' && performed.payload.disadvantage).toBe(true);
  });

  it('Help gives an ally’s next attack on that foe Advantage, and is spent by it', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    // A grey worg on the party's side beside Raider 1 (8,4), acting after the Shaman.
    const block = (await world.state()).statBlocks.get(RAIDER_2);
    const worg = 'creature-77c0f1a2';
    await world.dm({
      type: 'CreateEntity',
      entityId: worg,
      kind: 'creature',
      name: 'Grey Worg',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    });
    await world.dm({ type: 'SetStatBlock', entityId: worg, statBlock: block });
    await world.dm({
      type: 'AddCombatant',
      entityId: worg,
      side: 'party',
      position: { x: 9, y: 5 },
      initiative: 12,
    });
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
    await world.dm({ type: 'EndTurn', combatantId: SHAMAN });
    expect(message(await world.dm(act(worg, 'help', { targetId: RAIDER_3 })))).toBe('OUT_OF_RANGE');
    expect(codeOf(await world.dm(act(worg, 'help', { targetId: RAIDER_1 })))).toBe('accepted');
    for (const id of [worg, RAIDER_1, RAIDER_2, RAIDER_3]) {
      await world.dm({ type: 'EndTurn', combatantId: id });
    }
    world.roll(20, 15, 15);
    const shot = await world.submit(
      { type: 'Attack', combatantId: ELOWEN, attackId: 'longbow', targetId: RAIDER_1 },
      PLAYER,
    );
    const performed = (await recorded(world, shot)).find((e) => e.type === 'AttackPerformed');
    expect(performed?.type === 'AttackPerformed' && performed.payload.advantage).toBe(true);
    expect((await turnOf(world, worg))?.helping).toBeUndefined();
  });

  it('Hide from cover makes the hider Invisible until it attacks', async () => {
    const world = await roadWorld();
    const covered = (command: Record<string, unknown>) => {
      const battlefield = command['battlefield'] as { cover: object[] };
      return {
        ...command,
        battlefield: {
          ...battlefield,
          cover: [...battlefield.cover, { x: 2, y: 6, level: 'three-quarters' }],
        },
      };
    };
    await startAmbush(world, [17, 3, 2, 1, 15], covered);
    world.roll(20, 12);
    const hid = await world.submit(act(ELOWEN, 'hide'), PLAYER);
    expect(codeOf(hid)).toBe('accepted');
    const taken = (await recorded(world, hid)).find((e) => e.type === 'ActionTaken');
    expect(taken?.type === 'ActionTaken' && taken.payload.check).toMatchObject({
      skill: 'stealth',
      success: true,
    });
    expect((await world.state()).characterSheets.get(ELOWEN)?.conditions).toContain('invisible');
    // Hiding is the turn's action; next turn, her attack has Advantage and gives her away.
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
    for (const id of [SHAMAN, RAIDER_1, RAIDER_2, RAIDER_3]) {
      await world.dm({ type: 'EndTurn', combatantId: id });
    }
    world.roll(20, 15, 15);
    const shot = await world.submit(
      { type: 'Attack', combatantId: ELOWEN, attackId: 'longbow', targetId: RAIDER_2 },
      PLAYER,
    );
    const performed = (await recorded(world, shot)).find((e) => e.type === 'AttackPerformed');
    expect(performed?.type === 'AttackPerformed' && performed.payload.advantage).toBe(true);
    expect((await world.state()).characterSheets.get(ELOWEN)?.conditions).not.toContain(
      'invisible',
    );
  });

  it('Hide needs cover; Search a skill of its own; Ready a creature and a trigger', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    expect(message(await world.submit(act(ELOWEN, 'hide'), PLAYER))).toBe('NO_COVER_TO_HIDE');
    expect(message(await world.submit(act(ELOWEN, 'search', { skill: 'arcana' }), PLAYER))).toBe(
      'INVALID_SKILL',
    );
    expect(message(await world.submit(act(ELOWEN, 'ready'), PLAYER))).toBe('TARGET_REQUIRED');
    const readied = await world.submit(
      act(ELOWEN, 'ready', {
        targetId: RAIDER_1,
        readied: { attackId: 'longbow', trigger: 'When it leaves the wagon' },
      }),
      PLAYER,
    );
    expect(codeOf(readied)).toBe('accepted');
    expect((await turnOf(world, ELOWEN))?.readied).toEqual({
      attackId: 'longbow',
      targetId: RAIDER_1,
      trigger: 'When it leaves the wagon',
    });
    // A player takes no action for a creature.
    expect(codeOf(await world.submit(act(SHAMAN, 'dodge'), PLAYER))).toBe('FORBIDDEN');
  });

  it('Search rolls the skill the player picked, for the DM to read', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    world.roll(20, 10);
    const searched = await world.submit(act(ELOWEN, 'search', { skill: 'perception' }), PLAYER);
    expect(codeOf(searched)).toBe('accepted');
    const taken = (await recorded(world, searched)).find((e) => e.type === 'ActionTaken');
    expect(taken?.type === 'ActionTaken' && taken.payload).toMatchObject({
      action: 'search',
      check: { skill: 'perception', rolls: [10], total: 10 + 12 },
    });
    expect(taken?.type === 'ActionTaken' && taken.payload.check).not.toHaveProperty('success');
  });
});
