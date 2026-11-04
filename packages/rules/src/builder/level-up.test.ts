import type { CharacterSheet, ClassId, LevelUpChoices } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { deriveCharacter } from '../character-derived.ts';
import { srdClass } from '../srd/classes.ts';
import { classIn } from '../srd/russian-characters.ts';
import { choicesFor } from '../testing/character-choices.ts';
import { elowen as sheetOfElowen } from '../testing/elowen.ts';
import { buildCharacter } from './build.ts';
import {
  experienceFor,
  levelAsks,
  levelFeatures,
  levelForExperience,
  levelUpCharacter,
} from './level-up.ts';
import { classSpellList } from './spells.ts';

/**
 * A level gained (docs/adr/0056-characters-from-the-srd.md §3): the experience table, what a level
 * asks, the hit points fixed or rolled, an improvement that raises Constitution raising every
 * level's hit points, Extra Attack, spells, invocations, and a new class's prerequisites.
 */
const built = (classId: ClassId): CharacterSheet => {
  const result = buildCharacter(choicesFor(classId), () => 4);
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.sheet;
};
const none: Omit<LevelUpChoices, 'classId'> = {
  hitPoints: 'fixed',
  cantrips: [],
  spells: [],
  spellbook: [],
  expertise: [],
  invocations: [],
  metamagic: [],
  weaponMasteries: [],
};
const up = (sheet: CharacterSheet, choices: Partial<LevelUpChoices> & { classId: ClassId }) => {
  const result = levelUpCharacter(sheet, { ...none, ...choices }, (sides) => sides);
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.sheet;
};

/** What a level asks, filled in order from the spells not yet known; an improvement to Con. */
const asked = (sheet: CharacterSheet, classId: ClassId): LevelUpChoices => {
  const asks = levelAsks(sheet, classId);
  if (typeof asks === 'string') throw new Error(asks);
  const known = new Set([
    ...sheet.spellcasting.flatMap((source) => source.spells),
    ...(sheet.classChoices?.spellbook ?? []),
  ]);
  const fresh = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, index) => classSpellList(classId, from + index))
      .flat()
      .filter((id) => !known.has(id));
  const spellbook = fresh(1, asks.maxSpellLevel).slice(0, asks.spellbook);
  return {
    ...none,
    classId,
    ...(asks.improvement ? { improvement: { kind: 'scores', plus: ['con'] } } : {}),
    cantrips: fresh(0, 0).slice(0, asks.cantrips),
    spellbook,
    spells: (classId === 'wizard' ? spellbook : fresh(1, asks.maxSpellLevel)).slice(0, asks.spells),
  };
};

describe('a level gained', () => {
  it('needs the SRD’s experience points', () => {
    expect([2, 3, 20].map(experienceFor)).toEqual([300, 900, 355_000]);
    expect([0, 299, 300, 899, 900, 355_000].map(levelForExperience)).toEqual([1, 1, 2, 2, 3, 20]);
  });

  it('gives a Fighter its features, hit points, Extra Attack and an improvement', () => {
    const fighter = built('fighter');
    expect(levelAsks(fighter, 'fighter')).toMatchObject({
      classLevel: 2,
      features: ['Action Surge (one use)', 'Tactical Mind'],
      improvement: false,
    });
    const two = up(fighter, { classId: 'fighter' });
    // 6 for a d10, Con 13's +1, Dwarven Toughness's 1.
    expect(two.hitPoints.max - fighter.hitPoints.max).toBe(8);
    const three = up(two, { classId: 'fighter', hitPoints: 'rolled' });
    expect(three.classes[0]).toMatchObject({ level: 3, subclass: 'Champion' });
    expect(three.hitPoints.max - two.hitPoints.max).toBe(10 + 1 + 1);
    const refused = levelUpCharacter(three, { ...none, classId: 'fighter' }, () => 1);
    // Level 4 asks an improvement, and a fourth weapon's mastery (the table's column grows).
    expect(refused.ok ? [] : refused.problems.map((one) => one.field)).toEqual([
      'improvement',
      'weaponMasteries',
    ]);
    // Constitution 13 to 15: the modifier +2, a hit point more at each of the three levels before.
    const four = up(three, {
      classId: 'fighter',
      improvement: { kind: 'scores', plus: ['con'] },
      weaponMasteries: ['longbow'],
    });
    expect(four.abilities.con).toBe(15);
    expect(four.hitPoints.max - three.hitPoints.max).toBe(6 + 2 + 1 + 3);
    expect(four.weaponMasteries).toContain('longbow');
    const five = up(four, { classId: 'fighter' });
    expect(five.attacksPerAction).toBe(2);
  });

  it('gives a Wizard its spells and spellbook, a Warlock its invocations and Pact slots', () => {
    const wizard = built('wizard');
    const known = new Set([
      ...wizard.spellcasting.flatMap((source) => source.spells),
      ...(wizard.classChoices?.spellbook ?? []),
    ]);
    const fresh = classSpellList('wizard', 1).filter((id) => !known.has(id));
    const book = fresh.slice(0, 2);
    const two = up(wizard, { classId: 'wizard', spellbook: book, spells: [book[0] ?? ''] });
    expect(two.spellSlots.max.slice(0, 2)).toEqual([3, 0]);
    expect(two.classChoices?.spellbook).toHaveLength(8);
    const warlock = built('warlock');
    expect(levelAsks(warlock, 'warlock')).toMatchObject({ invocations: 2, spells: 1 });
    const pact = up(warlock, {
      classId: 'warlock',
      invocations: ['eldritch-mind', 'pact-of-the-tome'],
      spells: [
        classSpellList('warlock', 1).find((id) => !warlock.spellcasting[0]?.spells.includes(id)) ??
          '',
      ],
    });
    expect(pact.spellSlots.max[0]).toBe(2);
    expect(pact.classChoices?.invocations).toEqual([
      'armor-of-shadows',
      'eldritch-mind',
      'pact-of-the-tome',
    ]);
  });

  it('takes a new class only with 13 in every class’s primary abilities', () => {
    const fighter = built('fighter');
    // Intelligence 12 + the Acolyte's +1: 13, the Wizard's primary ability.
    expect(levelAsks(fighter, 'wizard')).toMatchObject({
      newClass: true,
      classLevel: 1,
      cantrips: 3,
    });
    expect(levelAsks({ ...fighter, abilities: { ...fighter.abilities, int: 12 } }, 'wizard')).toBe(
      'A new class needs 13 in the primary abilities of every class the character would have',
    );
    const rogue = levelAsks(fighter, 'rogue');
    expect(typeof rogue === 'string' ? null : rogue.multiclassSkill).toContain('stealth');
  });

  it('adds the fixed hit points and the spell slots by the table, a lowered maximum kept', () => {
    // Elowen: Ranger 7 / Wizard 8, Constitution 14.
    const elowen = sheetOfElowen();
    const next = up(elowen, asked(elowen, 'wizard'));
    expect(next.classes).toContainEqual(expect.objectContaining({ classId: 'wizard', level: 9 }));
    // A d6 level: 4 plus Constitution's +2.
    expect(next.hitPoints).toEqual({ max: 84, current: 84 });
    // Caster level 13 (Wizard 9 and Ranger 7 halved, rounded up): a 7th-level slot.
    expect(next.spellSlots.max).toEqual([4, 3, 3, 3, 2, 1, 1, 0, 0]);
    expect(deriveCharacter(next).proficiencyBonus).toBe(5);
    // Temporary hit points and a lowered maximum stay through it (docs/adr/0048-hit-points.md).
    const drained = up(
      { ...elowen, hitPoints: { max: 78, current: 40, reducedBy: 30, temporary: 4 } },
      asked(elowen, 'wizard'),
    );
    expect(drained.hitPoints).toEqual({ max: 84, current: 46, reducedBy: 30, temporary: 4 });
    // A spellbook spell is written once.
    const twice = levelUpCharacter(
      { ...next, classChoices: { spellbook: next.classChoices?.spellbook ?? [] } },
      { ...asked(next, 'wizard'), spellbook: next.classChoices?.spellbook?.slice(0, 2) ?? [] },
      () => 1,
    );
    expect(twice.ok ? [] : twice.problems.map((one) => one.field)).toContain('spellbook');
  });

  it('gives Extra Attack and slots by class level; a Cleric’s ninth-level slot at 17', () => {
    const elowen = sheetOfElowen();
    const ranger: CharacterSheet = {
      ...elowen,
      classes: [{ classId: 'ranger', level: 4 }],
      attacksPerAction: 1,
      spellcasting: elowen.spellcasting.filter((source) => source.source === 'ranger'),
      spellSlots: { max: [3, 0, 0, 0, 0, 0, 0, 0, 0], expended: [1, 0, 0, 0, 0, 0, 0, 0, 0] },
    };
    const five = up(ranger, asked(ranger, 'ranger'));
    expect(five.attacksPerAction).toBe(2);
    expect(five.spellSlots).toEqual({
      max: [4, 2, 0, 0, 0, 0, 0, 0, 0],
      expended: [1, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    const of = (classId: ClassId, level: number): CharacterSheet => ({
      ...elowen,
      classes: [{ classId, level }],
      abilities: { str: 14, dex: 14, con: 14, int: 10, wis: 14, cha: 10 },
      attacksPerAction: 1,
      spellSlots: { max: [0, 0, 0, 0, 0, 0, 0, 0, 0], expended: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
      spellcasting: [],
    });
    expect(up(of('fighter', 10), asked(of('fighter', 10), 'fighter')).attacksPerAction).toBe(3);
    const cleric = up(of('cleric', 16), asked(of('cleric', 16), 'cleric'));
    expect(cleric.spellSlots.max).toEqual([4, 3, 3, 3, 2, 1, 1, 1, 1]);
    // A d8 level: 5 plus Constitution's +2.
    expect(cleric.hitPoints.max - of('cleric', 16).hitPoints.max).toBe(7);
  });

  it('names a level’s features in the campaign’s language, where the table puts them', () => {
    const fighter = srdClass('fighter');
    if (!fighter) throw new Error('no Fighter');
    expect(levelFeatures(fighter, 3)).toEqual([
      'Fighter Subclass',
      'Improved Critical',
      'Remarkable Athlete',
    ]);
    const russian = levelFeatures(fighter, 4, classIn(fighter, 'ru').value);
    expect(russian).toEqual(['Увеличение характеристик']);
    expect(levelFeatures(fighter, 3, classIn(fighter, 'ru').value)).toHaveLength(3);
  });
});
