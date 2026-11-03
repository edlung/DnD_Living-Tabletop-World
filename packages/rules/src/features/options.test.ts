import type { CharacterSheet } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { applyCast, checkCast } from '../casting.ts';
import { elowen } from '../testing/elowen.ts';
import { startTurn } from '../turn.ts';
import {
  atWillOnSelf,
  eldritchMind,
  spellDamageBonus,
  spellRangeBonusFt,
  withInvocationSpells,
} from './invocations.ts';
import { distantRangeFt, metamagicCost, metamagicRefusal } from './metamagic.ts';

/**
 * The options chosen in play (docs/adr/0056-characters-from-the-srd.md §4): Eldritch Invocations
 * and Metamagic, as the rules count and apply them.
 */
const warlock = (invocations: string[]): CharacterSheet =>
  withInvocationSpells(
    elowen({
      classes: [{ classId: 'warlock', level: 5 }],
      abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 16 },
      spellcasting: [{ source: 'warlock', ability: 'cha', spells: ['eldritch-blast', 'hex'] }],
      classChoices: { invocations },
    }),
  );
const sorcerer = (metamagic: string[], spent = 0): CharacterSheet =>
  elowen({
    classes: [{ classId: 'sorcerer', level: 5 }],
    abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 16 },
    spellcasting: [{ source: 'sorcerer', ability: 'cha', spells: ['fire-bolt', 'magic-missile'] }],
    classChoices: { metamagic: metamagic },
    ...(spent > 0 ? { featureUses: { 'sorcery-points': spent } } : {}),
  });

describe('Eldritch Invocations', () => {
  it('cast their spells at will, some on the Warlock alone', () => {
    const sheet = warlock(['armor-of-shadows', 'mask-of-many-faces']);
    const source = sheet.spellcasting.find((one) => one.source === 'warlock');
    expect(source?.atWill).toEqual(['mage-armor', 'disguise-self']);
    expect(source?.spells).toContain('mage-armor');
    expect([atWillOnSelf(sheet, 'mage-armor'), atWillOnSelf(sheet, 'disguise-self')]).toEqual([
      true,
      false,
    ]);
    const plan = checkCast(sheet, startTurn(true), {
      spellId: 'mage-armor',
      using: 'free',
      target: { distanceFt: 0, visible: true },
    });
    expect(plan.legal && plan.atWill).toBe(true);
    if (!plan.legal) throw new Error(plan.reason);
    // Cast at will: no slot and no counted free cast.
    expect(applyCast(sheet, startTurn(true), plan).sheet.spellSlots).toEqual(sheet.spellSlots);
  });

  it('add Agonizing Blast’s Charisma, Eldritch Spear’s range and Eldritch Mind', () => {
    const sheet = warlock(['agonizing-blast', 'eldritch-spear', 'eldritch-mind']);
    expect(spellDamageBonus(sheet, 'eldritch-blast')).toBe(3);
    expect(spellDamageBonus(sheet, 'fire-bolt')).toBe(0);
    expect(spellRangeBonusFt(sheet, 'eldritch-blast')).toBe(150);
    expect(eldritchMind(sheet)).toBe(true);
    expect(eldritchMind(warlock([]))).toBe(false);
  });
});

describe('Metamagic', () => {
  it('costs what its words say, and only what the Sorcerer knows and can pay', () => {
    expect(
      ['quickened-spell', 'heightened-spell', 'careful-spell'].map((one) =>
        metamagicCost(one as never),
      ),
    ).toEqual([2, 2, 1]);
    const sheet = sorcerer(['quickened-spell', 'empowered-spell', 'distant-spell']);
    expect(metamagicRefusal(sheet, ['quickened-spell'])).toBeNull();
    expect(metamagicRefusal(sheet, ['twinned-spell'])).toBe('NOT_A_FEATURE');
    expect(metamagicRefusal(sheet, ['quickened-spell', 'distant-spell'])).toBe('ONE_METAMAGIC');
    expect(metamagicRefusal(sheet, ['quickened-spell', 'empowered-spell'])).toBeNull();
    expect(metamagicRefusal(sorcerer(['quickened-spell'], 4), ['quickened-spell'])).toBe(
      'NO_USES_LEFT',
    );
    expect([distantRangeFt(5), distantRangeFt(120)]).toEqual([30, 240]);
  });

  it('casts a Quickened spell with the Bonus Action and spends its points', () => {
    const sheet = sorcerer(['quickened-spell', 'distant-spell']);
    const plan = checkCast(sheet, startTurn(true), {
      spellId: 'fire-bolt',
      using: 'free',
      target: { distanceFt: 30, visible: true },
      metamagic: ['quickened-spell'],
    });
    if (!plan.legal) throw new Error(plan.reason);
    expect(plan.economy).toBe('bonus');
    const after = applyCast(sheet, startTurn(true), plan);
    expect(after.turn).toMatchObject({ actionUsed: false, bonusActionUsed: true });
    expect(after.sheet.featureUses).toEqual({ 'sorcery-points': 2 });
    // Distant: 120 ft doubled.
    const far = checkCast(sheet, startTurn(true), {
      spellId: 'fire-bolt',
      using: 'free',
      target: { distanceFt: 200, visible: true },
      metamagic: ['distant-spell'],
    });
    expect(far.legal).toBe(true);
  });
});
