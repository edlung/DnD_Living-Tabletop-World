import type { CharacterSheet, CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { ELOWEN, codeOf, roadWorld, type RoadWorld } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Magical contagions on the Old Trade Road (docs/adr/0055-rules-reference-and-toolbox.md §4): the
 * DM infects Elowen and follows each contagion's course; the World Engine rolls her saves.
 */
const sheetOf = async (world: RoadWorld) =>
  (await world.state()).characterSheets.get(ELOWEN) as CharacterSheet;
const infect = (world: RoadWorld, contagionId: string) =>
  world.dm({ type: 'InfectWithContagion', targetId: ELOWEN, contagionId });
const course = (world: RoadWorld, contagionId: string, step: string) =>
  world.dm({ type: 'ContagionCourse', targetId: ELOWEN, contagionId, step });
const reason = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;

describe('magical contagions', () => {
  it('Sewer Plague: a save against it, then at dawn a level of Exhaustion more or less', async () => {
    const world = await roadWorld();
    world.roll(20, 20);
    expect(codeOf(await infect(world, 'sewer-plague'))).toBe('accepted');
    expect((await sheetOf(world)).contagions).toBeUndefined();
    world.roll(20, 1);
    expect(codeOf(await infect(world, 'sewer-plague'))).toBe('accepted');
    expect((await sheetOf(world)).contagions).toEqual([
      { contagionId: 'sewer-plague', takenHold: false, successes: 0 },
    ]);
    expect(reason(await course(world, 'sewer-plague', 'fight'))).toBe('It has not taken hold yet');
    expect(codeOf(await course(world, 'sewer-plague', 'takes-hold'))).toBe('accepted');
    expect((await sheetOf(world)).exhaustion).toBe(1);
    world.roll(20, 1);
    await course(world, 'sewer-plague', 'fight');
    expect((await sheetOf(world)).exhaustion).toBe(2);
    world.roll(20, 20);
    await course(world, 'sewer-plague', 'fight');
    world.roll(20, 20);
    await course(world, 'sewer-plague', 'fight');
    const cured = await sheetOf(world);
    expect(cured.exhaustion).toBeUndefined();
    expect(cured.contagions).toBeUndefined();
    await verifyHistory(world);
  });

  it('Cackle Fever: no save against a tainted potion; three saves won end it', async () => {
    const world = await roadWorld();
    expect(codeOf(await infect(world, 'cackle-fever'))).toBe('accepted');
    expect(reason(await infect(world, 'cackle-fever'))).toBe('It carries that contagion already');
    await course(world, 'cackle-fever', 'takes-hold');
    expect((await sheetOf(world)).exhaustion).toBe(1);
    for (const face of [20, 1, 20, 20]) {
      world.roll(20, face);
      await course(world, 'cackle-fever', 'fight');
    }
    const cured = await sheetOf(world);
    expect(cured.contagions).toBeUndefined();
    expect(cured.exhaustion).toBeUndefined();
    await verifyHistory(world);
  });

  it('Sight Rot blinds at once; only magic ends it', async () => {
    const world = await roadWorld();
    world.roll(20, 1);
    await infect(world, 'sight-rot');
    expect((await sheetOf(world)).conditions).toContain('blinded');
    expect(reason(await course(world, 'sight-rot', 'fight'))).toBe(
      'Magic or an ointment ends it, not a save',
    );
    expect(codeOf(await course(world, 'sight-rot', 'cure'))).toBe('accepted');
    const cured = await sheetOf(world);
    expect(cured.conditions).not.toContain('blinded');
    expect(cured.contagions).toBeUndefined();
    expect(reason(await course(world, 'sight-rot', 'cure'))).toBe(
      'It does not carry that contagion',
    );
    await verifyHistory(world);
  });
});
