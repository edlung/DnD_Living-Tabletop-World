import type { CharacterSheet, CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  PLAYER,
  RAIDER_1,
  RAIDER_2,
  codeOf,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * The spells that return the dead (docs/adr/0056-characters-from-the-srd.md §5): Revivify within a
 * minute — a fight's rounds while it runs — with 1 Hit Point; Raise Dead and Resurrection outside
 * a fight, an hour's casting, with 1 Hit Point or all, poisons gone and the ordeal of −4; none on
 * the living, and none on one dead longer than it reaches. Undo puts the dead back as they were.
 */
const RAISING = ['revivify', 'raise-dead', 'resurrection', 'true-resurrection'];
const IDA = 'character-7b2e4f91';

const reasonOf = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;

const kill = (world: RoadWorld, targetId: string) =>
  world.dm({
    type: 'AdjustHitPoints',
    targetId,
    change: 'damage',
    amount: 999,
    damageType: 'slashing',
    reason: 'A killing blow',
  });

/**
 * Elowen's sheet with the raising spells beside her own, a cleric's Wisdom behind them, and the
 * slots of a 13th-level caster (a 7th-level one for Resurrection).
 */
async function raiser(world: RoadWorld, entityId = ELOWEN) {
  const sheet = (await world.state()).characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('no sheet');
  const next: CharacterSheet = {
    ...sheet,
    spellcasting: [...sheet.spellcasting, { source: 'cleric', ability: 'wis', spells: RAISING }],
    spellSlots: { max: [4, 3, 3, 3, 2, 1, 1, 0, 0], expended: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
  };
  const set = await world.dm({ type: 'SetCharacterSheet', entityId, sheet: next });
  expect(codeOf(set)).toBe('accepted');
}

/** Ida Vane, a second character beside Elowen on the road, who knows the raising spells. */
async function ida(world: RoadWorld) {
  const place = (await world.state()).entities.get(ELOWEN)?.placement?.locationId;
  if (!place) throw new Error('Elowen is nowhere');
  const made = await world.dm({
    type: 'CreateEntity',
    entityId: IDA,
    kind: 'character',
    name: 'Ida Vane',
    existsSince: null,
    placement: { locationId: place, since: null },
  });
  expect(codeOf(made)).toBe('accepted');
  await raiser(world, IDA);
}

describe('Revivify in a fight', () => {
  it('returns a creature dead within the minute with 1 Hit Point, and never the living', async () => {
    const world = await roadWorld();
    await raiser(world);
    await startAmbush(world, undefined, (command) => ({
      ...command,
      combatants: command.combatants.map((one) =>
        one.entityId === RAIDER_1 ? { ...one, position: { x: 3, y: 6 } } : one,
      ),
    }));
    expect(codeOf(await kill(world, RAIDER_1))).toBe('accepted');
    const dead = await world.state();
    expect(dead.entities.get(RAIDER_1)?.status).toBe('dead');
    expect(dead.deaths.get(RAIDER_1)).toMatchObject({ round: 1 });
    const cast = (targetId: string) =>
      world.submit(
        {
          type: 'CastSpell',
          combatantId: ELOWEN,
          spellId: 'revivify',
          using: { slotLevel: 3 },
          targetIds: [targetId],
        },
        PLAYER,
      );
    expect(reasonOf(await cast(RAIDER_2))).toBe('NOT_DEAD');
    expect(codeOf(await cast(RAIDER_1))).toBe('accepted');
    const back = await world.state();
    expect(back.entities.get(RAIDER_1)?.status).toBe('active');
    expect(back.statBlocks.get(RAIDER_1)?.hitPoints.current).toBe(1);
    expect(back.deaths.has(RAIDER_1)).toBe(false);
    await verifyHistory(world);
  });
});

describe('the spells that return the dead outside a fight', () => {
  it('Raise Dead: 1 Hit Point, the poison gone, and the ordeal of −4', async () => {
    const world = await roadWorld();
    await ida(world);
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    if (!sheet) throw new Error('no sheet');
    await world.dm({
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: { ...sheet, conditions: ['poisoned'] },
    });
    expect(codeOf(await kill(world, ELOWEN))).toBe('accepted');
    const raise = await world.dm({
      type: 'CastSpell',
      combatantId: IDA,
      spellId: 'raise-dead',
      using: { slotLevel: 5 },
      targetIds: [ELOWEN],
    });
    expect(codeOf(raise)).toBe('accepted');
    const state = await world.state();
    expect(state.entities.get(ELOWEN)?.status).toBe('active');
    const raised = state.characterSheets.get(ELOWEN);
    expect(raised?.hitPoints.current).toBe(1);
    expect(raised?.conditions).toEqual([]);
    expect(raised?.ordeal).toBe(4);
    expect(raised?.deathSaves).toBeUndefined();
    await verifyHistory(world);
  });

  it('refuses Revivify a minute too late; Resurrection returns all, and undo puts back the dead', async () => {
    const world = await roadWorld();
    await ida(world);
    await kill(world, ELOWEN);
    const deathAt = (await world.state()).deaths.get(ELOWEN)?.at;
    expect(codeOf(await world.dm({ type: 'AdvanceWorldTime', by: 120 }))).toBe('accepted');
    const cast = (spellId: string, slotLevel: number) =>
      world.dm({
        type: 'CastSpell',
        combatantId: IDA,
        spellId,
        using: { slotLevel },
        targetIds: [ELOWEN],
      });
    expect(reasonOf(await cast('revivify', 3))).toBe('DEAD_TOO_LONG');
    const resurrection = await cast('resurrection', 7);
    expect(codeOf(resurrection)).toBe('accepted');
    const back = (await world.state()).characterSheets.get(ELOWEN);
    expect(back?.hitPoints.current).toBe(back?.hitPoints.max);
    expect(back?.ordeal).toBe(4);
    const undone = await world.dm({
      type: 'UndoCommand',
      targetCommandId: resurrection.commandId ?? '',
    });
    expect(codeOf(undone)).toBe('accepted');
    const again = await world.state();
    expect(again.entities.get(ELOWEN)?.status).toBe('dead');
    expect(again.deaths.get(ELOWEN)?.at).toBe(deathAt);
    await verifyHistory(world);
  });
});
