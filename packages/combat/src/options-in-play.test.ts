import type { CharacterSheet, CommandResult } from '@ltw/contracts';
import { withInvocationSpells } from '@ltw/rules';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  RAIDER_2,
  RAIDER_3,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';

/**
 * Invocations and Metamagic in play (docs/adr/0056-characters-from-the-srd.md §4), through the
 * World Engine: Elowen made a Warlock or a Sorcerer.
 */
const message = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;
const cast = (spellId: string, extra: Record<string, unknown> = {}) => ({
  type: 'CastSpell',
  combatantId: ELOWEN,
  spellId,
  ...extra,
});
const scores = { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 16 };

async function become(world: RoadWorld, sheet: (base: CharacterSheet) => CharacterSheet) {
  const base = (await world.state()).characterSheets.get(ELOWEN);
  if (!base) throw new Error('no sheet');
  const set = await world.dm({ type: 'SetCharacterSheet', entityId: ELOWEN, sheet: sheet(base) });
  expect(codeOf(set)).toBe('accepted');
}

const warlock = (base: CharacterSheet): CharacterSheet =>
  withInvocationSpells({
    ...base,
    classes: [{ classId: 'warlock', level: 5 }],
    abilities: scores,
    spellcasting: [{ source: 'warlock', ability: 'cha', spells: ['eldritch-blast'] }],
    classChoices: { invocations: ['armor-of-shadows', 'agonizing-blast'] },
  });

describe('Eldritch Invocations in play', () => {
  it('casts Mage Armor at will on the Warlock alone, spending nothing', async () => {
    const world = await roadWorld();
    await become(world, warlock);
    const slots = (await world.state()).characterSheets.get(ELOWEN)?.spellSlots;
    for (let time = 0; time < 2; time += 1)
      expect(
        message(await world.submit(cast('mage-armor', { using: 'free', targetIds: [ELOWEN] }))),
      ).toBe('accepted');
    expect((await world.state()).characterSheets.get(ELOWEN)?.spellSlots).toEqual(slots);
    const other = cast('mage-armor', { using: 'free', targetIds: ['mira-vale'] });
    expect(message(await world.submit(other))).toBe('SELF_ONLY');
  });

  it('adds Agonizing Blast’s Charisma to each Eldritch Blast beam', async () => {
    const world = await roadWorld();
    await become(world, warlock);
    await startAmbush(world);
    // The dice in the order they are rolled: a beam's d20, then its d10.
    world.roll(20, 18);
    world.roll(10, 4);
    world.roll(20, 18);
    world.roll(10, 4);
    const blast = await world.submit(cast('eldritch-blast', { targetIds: [RAIDER_2, RAIDER_2] }));
    expect(codeOf(blast)).toBe('accepted');
    const damage = (await recorded(world, blast)).flatMap((event) =>
      event.type === 'DamageApplied' ? [event.payload] : [],
    );
    // 1d10 (4) and Charisma +3 a beam.
    expect(damage[0]).toMatchObject({ amount: 7, damageType: 'force' });
  });
});

describe('Metamagic in play', () => {
  const sorcerer = (base: CharacterSheet): CharacterSheet => ({
    ...base,
    classes: [{ classId: 'sorcerer', level: 5 }],
    abilities: scores,
    spellcasting: [{ source: 'sorcerer', ability: 'cha', spells: ['fire-bolt', 'magic-missile'] }],
    spellSlots: { max: [4, 3, 2, 0, 0, 0, 0, 0, 0], expended: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
    classChoices: { metamagic: ['quickened-spell', 'distant-spell'] },
  });

  it('casts a Quickened Fire Bolt with the Bonus Action, then no spell of level 1+', async () => {
    const world = await roadWorld();
    await become(world, sorcerer);
    await startAmbush(world);
    world.roll(20, 18);
    world.roll(10, 5, 5);
    const quick = cast('fire-bolt', {
      targetIds: [RAIDER_2],
      metamagic: { options: ['quickened-spell'] },
    });
    expect(codeOf(await world.submit(quick))).toBe('accepted');
    const turn = (await world.encounter()).combatants.find((one) => one.entityId === ELOWEN)?.turn;
    expect(turn).toMatchObject({ actionUsed: false, bonusActionUsed: true });
    expect((await world.state()).characterSheets.get(ELOWEN)?.featureUses).toEqual({
      'sorcery-points': 2,
    });
    const missile = cast('magic-missile', {
      using: { slotLevel: 1 },
      targetIds: [RAIDER_3, RAIDER_3, RAIDER_3],
    });
    expect(message(await world.submit(missile))).toBe('SLOT_ALREADY_USED_THIS_TURN');
    const unknown = cast('fire-bolt', {
      targetIds: [RAIDER_2],
      metamagic: { options: ['twinned-spell'] },
    });
    expect(message(await world.submit(unknown))).toBe('NOT_A_FEATURE');
  });
});
