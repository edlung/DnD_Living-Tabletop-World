import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  RAIDER_1,
  RAIDER_2,
  RAIDER_3,
  SHAMAN,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
} from './testing/road.ts';

/**
 * `Attack` (ADR 0015 §3). Elowen's Longbow: +11 to hit, 1d8+4 piercing,
 * Slow mastery, two attacks per Attack action. Raider 1 stands in half cover
 * (AC 15 + 2); Raiders 2 and 3 in the open (AC 15).
 */
const shoot = (targetId: string) => ({
  type: 'Attack',
  combatantId: ELOWEN,
  attackId: 'longbow',
  targetId,
});
const outcomeOf = (result: CommandResult) =>
  result.status === 'rejected' ? result.code : result.outcome;

describe('attacks', () => {
  it('adds cover to AC', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    world.roll(20, 5);
    expect(outcomeOf(await world.submit(shoot(RAIDER_1)))).toEqual({
      kind: 'Attack',
      d20: [5],
      attackTotal: 16,
      hit: false,
      critical: false,
      damage: null,
    });
    world.roll(20, 6);
    world.roll(8, 2);
    const hit = await world.submit(shoot(RAIDER_1));
    expect(outcomeOf(hit)).toMatchObject({ attackTotal: 17, hit: true, damage: 6 });
    const attack = (await recorded(world, hit)).find((e) => e.type === 'AttackPerformed');
    expect(attack?.payload).toMatchObject({ cover: 'half', modifier: 11 });
  });

  it('doubles the dice on a Critical Hit, and a monster dies at 0 HP without being Slowed', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    world.roll(20, 20);
    world.roll(8, 3, 3);
    const crit = await world.submit(shoot(RAIDER_2));
    expect(outcomeOf(crit)).toMatchObject({ critical: true, damage: 10 });
    const state = await world.state();
    expect(state.entities.get(RAIDER_2)?.status).toBe('dead');
    expect(state.statBlocks.get(RAIDER_2)?.conditions).toEqual([]);
    expect(codeOf(await world.submit(shoot(RAIDER_2)))).toBe('TARGET_DEAD');
  });

  it('Slows the target until the start of the attacker’s next turn', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    world.roll(20, 15);
    world.roll(8, 1);
    await world.submit(shoot(RAIDER_2));
    expect((await world.state()).statBlocks.get(RAIDER_2)?.conditions).toEqual(['slowed']);
    for (const id of [ELOWEN, SHAMAN, RAIDER_1])
      await world.dm({ type: 'EndTurn', combatantId: id });
    // Raider 2's Speed is 20 ft: five squares are too far.
    const far = {
      type: 'MoveCombatant',
      combatantId: RAIDER_2,
      path: [9, 8, 7, 6, 5].map((x) => ({ x, y: 7 })),
    };
    expect(codeOf(await world.dm(far))).toBe('ILLEGAL_ACTION');
    await world.dm({ type: 'EndTurn', combatantId: RAIDER_2 });
    await world.dm({ type: 'EndTurn', combatantId: RAIDER_3 });
    const state = await world.state();
    expect(state.statBlocks.get(RAIDER_2)?.conditions).toEqual([]);
    expect(state.encounter?.combatants.find((c) => c.entityId === RAIDER_2)?.slowedBy).toBeNull();
  });

  it('adds Hunter’s Mark damage against the marked target only', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const mark = await world.submit({
      type: 'CastSpell',
      combatantId: ELOWEN,
      spellId: 'hunters-mark',
      targetId: RAIDER_3,
    });
    expect(codeOf(mark)).toBe('accepted');
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    expect(sheet?.concentration).toEqual({ spellId: 'hunters-mark', targetId: RAIDER_3 });
    expect(sheet?.spellcasting[0]?.freeCasts?.used).toBe(1);
    world.roll(20, 15);
    world.roll(8, 2);
    world.roll(6, 3);
    const marked = await world.submit(shoot(RAIDER_3));
    expect(outcomeOf(marked)).toMatchObject({ damage: 9 });
    const damage = (await recorded(world, marked)).find((e) => e.type === 'DamageApplied');
    expect(damage?.payload).toMatchObject({ rolls: [2, 3], hpAfter: 1 });
    world.roll(20, 15);
    world.roll(8, 2);
    expect(outcomeOf(await world.submit(shoot(RAIDER_1)))).toMatchObject({ damage: 6 });
  });

  it('allows two attacks per Attack action (Extra Attack)', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    world.roll(20, 1);
    await world.submit(shoot(RAIDER_3));
    world.roll(20, 1);
    await world.submit(shoot(RAIDER_3));
    const third = await world.submit(shoot(RAIDER_3));
    expect(third.status === 'rejected' && third.message).toBe('NO_ACTION');
  });

  it('refuses targets out of reach or in total cover, with the movement needed', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, (command) => ({
      ...command,
      combatants: command.combatants.map((c) =>
        c.entityId === RAIDER_3 ? { ...c, position: { x: 3, y: 2 } } : c,
      ),
    }));
    const covered = await world.submit(shoot(RAIDER_3));
    expect(covered.status === 'rejected' && covered.message).toBe('TOTAL_COVER');
    await world.dm({ type: 'EndTurn', combatantId: ELOWEN });
    const dagger = await world.dm({
      type: 'Attack',
      combatantId: SHAMAN,
      attackId: 'dagger',
      targetId: ELOWEN,
    });
    expect(dagger.status === 'rejected' && dagger.details).toEqual({
      reason: 'OUT_OF_RANGE',
      resolution: { moveRequiredFt: 45 },
    });
  });

  it('lets the DM attack with a goblin and never lets a player do so', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm({ type: 'EndTurn', combatantId: ELOWEN });
    const bolt = { type: 'Attack', combatantId: SHAMAN, attackId: 'dagger', targetId: ELOWEN };
    expect(codeOf(await world.submit(bolt))).toBe('FORBIDDEN');
    expect(codeOf(await world.dm(shoot(RAIDER_1)))).toBe('NOT_YOUR_TURN');
  });
});
