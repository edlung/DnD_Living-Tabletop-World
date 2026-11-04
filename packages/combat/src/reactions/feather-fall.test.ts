import type { CharacterSheet, Square } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  PLAYER,
  RAIDER_1,
  codeOf,
  openWindowId,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from '../testing/road.ts';
import { verifyHistory } from '../testing/verify.ts';

/**
 * Feather Fall, the reaction to a fall (docs/adr/0049-space-and-movement.md §8), through the World
 * Engine on the Old Trade Road: Elowen (78 HP) at (2, 6) knows it unless a test says otherwise. A
 * pit at (3, 6), 20 ft deep; or a ledge 10 ft high under her and Raider 1, the ground dropping at
 * x = 4.
 */
interface Setup {
  readonly ground: readonly (Square & { ft: number })[];
  readonly knows?: boolean;
  readonly beside?: boolean;
  readonly strength?: number;
}

async function road({ ground, knows = true, beside = false, strength }: Setup): Promise<RoadWorld> {
  const world = await roadWorld();
  const state = await world.state();
  const sheet = state.characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('no sheet');
  const spells: CharacterSheet['spellcasting'] = sheet.spellcasting.map((source, index) =>
    index === 0 && knows ? { ...source, spells: [...source.spells, 'feather-fall'] } : source,
  );
  await world.dm({
    type: 'SetCharacterSheet',
    entityId: ELOWEN,
    sheet: {
      ...sheet,
      spellcasting: spells,
      ...(strength === undefined ? {} : { abilities: { ...sheet.abilities, str: strength } }),
    },
  });
  const started = await startAmbush(world, undefined, (command) => ({
    ...command,
    battlefield: { ...command.battlefield, ground },
    combatants: command.combatants.map((c) =>
      beside && c.entityId === RAIDER_1 ? { ...c, position: { x: 3, y: 5 } } : c,
    ),
  }));
  expect(codeOf(started)).toBe('accepted');
  return world;
}

const pit = [{ x: 3, y: 6, ft: -20 }];
const drop = (world: RoadWorld) =>
  world.submit(
    { type: 'MoveCombatant', combatantId: ELOWEN, path: [{ x: 3, y: 6, drop: true }] },
    PLAYER,
  );
const sheetOf = async (world: RoadWorld) => {
  const sheet = (await world.state()).characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('no sheet');
  return sheet;
};

describe('Feather Fall', () => {
  it('waits on her drop into a pit, and slows her: no damage, on her feet', async () => {
    const world = await road({ ground: pit });
    const dropped = await drop(world);
    expect(codeOf(dropped)).toBe('accepted');
    expect(dropped.status === 'accepted' && dropped.outcome).toMatchObject({
      position: { x: 3, y: 6 },
      falling: true,
    });
    const windowId = await openWindowId(world);
    const window = (await world.state()).reactionWindows.get(windowId);
    expect(window?.trigger).toEqual({ kind: 'fall', fallers: [{ entityId: ELOWEN, feet: 20 }] });
    expect(window?.candidates).toEqual([
      { entityId: ELOWEN, response: 'pending', reactions: ['feather-fall'] },
    ]);
    const before = await sheetOf(world);
    const slowed = await world.submit(
      { type: 'UseReaction', combatantId: ELOWEN, windowId, reaction: 'feather-fall' },
      PLAYER,
    );
    expect(codeOf(slowed)).toBe('accepted');
    const after = await sheetOf(world);
    expect(after.hitPoints.current).toBe(before.hitPoints.current);
    expect(after.conditions).not.toContain('prone');
    expect(after.spellSlots.expended[0]).toBe((before.spellSlots.expended[0] ?? 0) + 1);
    const state = await world.state();
    expect(state.encounter?.combatants.find((c) => c.entityId === ELOWEN)?.turn).toMatchObject({
      reactionAvailable: false,
    });
    expect(state.reactionWindows.get(windowId)?.status).toBe('proceeded');
    await verifyHistory(world);
  });

  it('let go, the fall lands: 2d6 for 20 ft, and Prone', async () => {
    const world = await road({ ground: pit });
    await drop(world);
    const windowId = await openWindowId(world);
    world.roll(6, 3, 4);
    const let_ = await world.submit(
      { type: 'DeclineReaction', combatantId: ELOWEN, windowId },
      PLAYER,
    );
    expect(codeOf(let_)).toBe('accepted');
    const fall = (await recorded(world, let_)).find((e) => e.type === 'DamageApplied');
    expect(fall?.payload).toMatchObject({ targetId: ELOWEN, fallFt: 20, amount: 7 });
    expect((await sheetOf(world)).conditions).toContain('prone');
    await verifyHistory(world);
  });

  it('asks no one without the spell: the fall lands at once', async () => {
    const world = await road({ ground: pit, knows: false });
    world.roll(6, 2, 2);
    const dropped = await drop(world);
    expect((await world.state()).reactionWindows.size).toBe(0);
    const fall = (await recorded(world, dropped)).find((e) => e.type === 'DamageApplied');
    expect(fall?.payload).toMatchObject({ fallFt: 20, amount: 4 });
  });

  it('asks her about the raider she shoves off the ledge; let go, it lands hard', async () => {
    // Both stand on a ledge 10 ft high; she shoves Raider 1, beside her at (3, 5), off it.
    const ledge = [2, 3].flatMap((x) => [5, 6].map((y) => ({ x, y, ft: 10 })));
    const world = await road({ ground: ledge, beside: true, strength: 16 });
    world.roll(20, 2);
    const shoved = await world.submit(
      {
        type: 'Attack',
        combatantId: ELOWEN,
        attackId: 'unarmed-strike',
        targetId: RAIDER_1,
        unarmed: 'shove',
        shove: 'push',
      },
      PLAYER,
    );
    expect(codeOf(shoved)).toBe('accepted');
    const windowId = await openWindowId(world);
    expect((await world.state()).reactionWindows.get(windowId)?.trigger).toEqual({
      kind: 'fall',
      fallers: [{ entityId: RAIDER_1, feet: 10 }],
    });
    world.roll(6, 5);
    const let_ = await world.submit(
      { type: 'DeclineReaction', combatantId: ELOWEN, windowId },
      PLAYER,
    );
    const fall = (await recorded(world, let_)).find((e) => e.type === 'DamageApplied');
    expect(fall?.payload).toMatchObject({ targetId: RAIDER_1, fallFt: 10, amount: 5 });
    await verifyHistory(world);
  });
});
