import type { CharacterSheet, CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { ELOWEN, codeOf, roadWorld, type RoadWorld } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * The Gameplay Toolbox on the Old Trade Road (docs/adr/0055-rules-reference-and-toolbox.md §4):
 * the DM springs the SRD's traps on Elowen and puts her mind under stress; the World Engine rolls
 * her saves and the damage, and a pit is a fall.
 */
const sheetOf = async (world: RoadWorld) =>
  (await world.state()).characterSheets.get(ELOWEN) as CharacterSheet;
const hpOf = async (world: RoadWorld) => (await sheetOf(world)).hitPoints.current;
const spring = (world: RoadWorld, trapId: string, tier = 1) =>
  world.dm({ type: 'SpringTrap', trapId, tier, targetIds: [ELOWEN] });
const reason = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;

describe('the Toolbox’s traps', () => {
  it('a collapsing roof: the whole damage on a failed save, half on a success', async () => {
    const world = await roadWorld();
    const before = await hpOf(world);
    world.roll(20, 1);
    world.roll(10, 6, 5);
    expect(codeOf(await spring(world, 'collapsing-roof'))).toBe('accepted');
    expect(await hpOf(world)).toBe(before - 11);
    world.roll(20, 20);
    world.roll(10, 6, 5);
    expect(codeOf(await spring(world, 'collapsing-roof'))).toBe('accepted');
    expect(await hpOf(world)).toBe(before - 11 - 5);
    await verifyHistory(world);
  });

  it('a hidden pit is a fall: 1d6 a 10 feet of its depth, and Prone', async () => {
    const world = await roadWorld();
    const before = await hpOf(world);
    world.roll(6, 1, 2, 3);
    expect(codeOf(await spring(world, 'hidden-pit', 2))).toBe('accepted');
    const sheet = await sheetOf(world);
    expect(sheet.hitPoints.current).toBe(before - 6);
    expect(sheet.conditions).toContain('prone');
    await verifyHistory(world);
  });

  it('a falling net holds on a failed save; a poisoned needle poisons', async () => {
    const world = await roadWorld();
    // Her Dexterity save is +9: a net of the highest tier (DC 16) holds her on a 1.
    world.roll(20, 1);
    expect(codeOf(await spring(world, 'falling-net', 4))).toBe('accepted');
    expect((await sheetOf(world)).conditions).toContain('restrained');
    const before = await hpOf(world);
    world.roll(20, 1);
    world.roll(10, 7);
    expect(codeOf(await spring(world, 'poisoned-needle'))).toBe('accepted');
    const sheet = await sheetOf(world);
    expect(sheet.hitPoints.current).toBe(before - 7);
    expect(sheet.conditions).toContain('poisoned');
    await verifyHistory(world);
  });

  it('poisoned darts: a failed save takes 1d3 darts, each its own poison', async () => {
    const world = await roadWorld();
    const before = await hpOf(world);
    world.roll(20, 1);
    world.roll(3, 2);
    world.roll(6, 4, 5);
    expect(codeOf(await spring(world, 'poisoned-darts'))).toBe('accepted');
    expect(await hpOf(world)).toBe(before - 9);
    // The rolling stone has one tier.
    expect(reason(await spring(world, 'rolling-stone', 2))).toBe('That trap has no such tier');
  });
});

describe('mental stress', () => {
  it('Psychic damage on a failed save; half on a success, as the DM chose', async () => {
    const world = await roadWorld();
    const before = await hpOf(world);
    const stress = (onSuccess: 'none' | 'half') =>
      world.dm({
        type: 'InflictMentalStress',
        targetIds: [ELOWEN],
        ability: 'wis',
        dc: 15,
        dice: 3,
        onSuccess,
      });
    world.roll(20, 1);
    world.roll(6, 3, 3, 3);
    expect(codeOf(await stress('half'))).toBe('accepted');
    expect(await hpOf(world)).toBe(before - 9);
    world.roll(20, 20);
    world.roll(6, 3, 3, 3);
    expect(codeOf(await stress('half'))).toBe('accepted');
    expect(await hpOf(world)).toBe(before - 9 - 4);
    world.roll(20, 20);
    world.roll(6, 3, 3, 3);
    expect(codeOf(await stress('none'))).toBe('accepted');
    expect(await hpOf(world)).toBe(before - 9 - 4);
    // A player cannot.
    expect(
      codeOf(
        await world.submit({
          type: 'InflictMentalStress',
          targetIds: [ELOWEN],
          ability: 'wis',
          dc: 10,
          dice: 1,
          onSuccess: 'none',
        }),
      ),
    ).not.toBe('accepted');
    await verifyHistory(world);
  });
});
