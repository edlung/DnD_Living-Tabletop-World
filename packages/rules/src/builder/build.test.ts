import { CLASS_IDS, type CharacterChoices, type ClassId } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { srdClass } from '../srd/classes.ts';
import { SRD_FEATS } from '../srd/origins.ts';
import { buildCharacter } from './build.ts';
import { classCasting, classSpellList } from './spells.ts';

/**
 * The builder makes a level 1 character from the SRD's numbers (docs/adr/0056-characters-from-the-
 * srd.md §2): every class with valid choices; Hit Points, Armor Class, saves, skills, spells and
 * equipment as the SRD gives them; and a problem for each choice that does not hold.
 */
const d6 = () => 4;

/** The first valid choices of a class, as a player taking the defaults would make them. */
function choicesFor(classId: ClassId, more: Partial<CharacterChoices> = {}): CharacterChoices {
  const cls = srdClass(classId);
  if (!cls) throw new Error(classId);
  const casting = classCasting(cls, classId, 1);
  // The Thaumaturge's cantrip: the Cleric takes it below; the Druid is a Warden.
  const extra = classId === 'cleric' ? 1 : 0;
  const cantrips = classSpellList(classId, 0).slice(0, (casting?.cantrips ?? 0) + extra);
  const level1 = classSpellList(classId, 1);
  const spellbook = classId === 'wizard' ? level1.slice(0, 6) : [];
  const toolPick = cls.creation.tools.pick;
  const tools = toolPick ? toolPick.from.slice(0, toolPick.count) : [];
  const picks = (cls.creation.equipment[0]?.picks ?? []).map((pick) => pick.from[0] ?? '');
  const skills = cls.creation.skills.from.filter(
    (skill) => !['insight', 'religion'].includes(skill),
  );
  return {
    classId,
    speciesId: 'dwarf',
    backgroundId: 'acolyte',
    abilities: {
      method: 'standard-array',
      base: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    },
    increases: { plus2: 'wis', plus1: 'int' },
    skills: skills.slice(0, cls.creation.skills.choose),
    moreSkills: [],
    expertise: classId === 'rogue' ? skills.slice(0, 2) : [],
    tools,
    equipment: {
      classOption: 'A',
      backgroundOption: 'A',
      picks: [...picks, 'srd-amulet-holy-symbol'],
    },
    magicInitiate: {
      list: 'cleric',
      ability: 'wis',
      cantrips: classSpellList('cleric', 0).slice(0, 2),
      spell: classSpellList('cleric', 1)[0] ?? '',
    },
    ...(classId === 'fighter' ? { fightingStyle: 'defense' as const } : {}),
    ...(classId === 'cleric' ? { order: 'thaumaturge' as const } : {}),
    ...(classId === 'druid' ? { order: 'warden' as const } : {}),
    invocations: classId === 'warlock' ? ['armor-of-shadows'] : [],
    weaponMasteries: (
      { barbarian: 2, fighter: 3, paladin: 2, ranger: 2, rogue: 2 } as Partial<
        Record<ClassId, number>
      >
    )[classId]
      ? (['greataxe', 'handaxe', 'longsword'] as const).slice(
          0,
          ({ fighter: 3 } as Partial<Record<ClassId, number>>)[classId] ?? 2,
        )
      : [],
    cantrips,
    spells: (classId === 'wizard' ? spellbook : level1).slice(0, casting?.prepared ?? 0),
    spellbook,
    ...more,
  };
}

describe('the character builder', () => {
  it('builds every class at level 1 from valid choices', () => {
    for (const classId of CLASS_IDS) {
      const built = buildCharacter(choicesFor(classId), d6);
      expect(built.ok ? [] : built.problems, classId).toEqual([]);
    }
  });

  it('gives the SRD’s numbers: hit points, armor, saves, spells, equipment', () => {
    const fighter = buildCharacter(choicesFor('fighter'), d6);
    if (!fighter.ok) throw new Error(JSON.stringify(fighter.problems));
    // A Dwarf Fighter: 10 + Con 13 (+1) + Dwarven Toughness's 1.
    expect(fighter.sheet.hitPoints).toEqual({ max: 12, current: 12 });
    expect(fighter.sheet.armorClass).toBe(12);
    expect(fighter.sheet.savingThrows).toEqual(['str', 'con']);
    expect(fighter.sheet.senses).toEqual({ darkvision: 120 });
    expect(fighter.sheet.resistances).toEqual(['poison']);
    expect(fighter.sheet.feats).toEqual(['magic-initiate', 'defense']);
    expect(fighter.sheet.weapons).toEqual(['greatsword', 'flail', 'javelin']);
    expect(fighter.items.find((item) => item.wear === 'body')?.catalogId).toBe('srd-chain-mail');
    expect(fighter.items.filter((item) => item.catalogId === 'gold-crown')).toEqual([
      { catalogId: 'gold-crown', quantity: 12 },
    ]);
    expect(fighter.sheet.abilities.wis).toBe(12);

    const barbarian = buildCharacter(choicesFor('barbarian'), d6);
    if (!barbarian.ok) throw new Error('barbarian');
    // Unarmored Defense: 10 + Dex (+2) + Con (+1).
    expect(barbarian.sheet.armorClass).toBe(13);
    expect(barbarian.sheet.hitPoints.max).toBe(14);

    const wizard = buildCharacter(choicesFor('wizard'), d6);
    if (!wizard.ok) throw new Error('wizard');
    expect(wizard.sheet.spellSlots.max).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(wizard.sheet.spellcasting.map((source) => source.source)).toEqual([
      'wizard',
      'magic-initiate',
    ]);
    expect(wizard.sheet.spellcasting[0]?.spells).toHaveLength(3 + 4);

    const ranger = buildCharacter(choicesFor('ranger'), d6);
    if (!ranger.ok) throw new Error('ranger');
    expect(ranger.sheet.spellcasting[0]?.freeCasts).toEqual({
      spellId: 'hunters-mark',
      perLongRest: 2,
      used: 0,
    });

    const warlock = buildCharacter(choicesFor('warlock'), d6);
    if (!warlock.ok) throw new Error('warlock');
    expect(warlock.sheet.spellSlots.max[0]).toBe(1);
    expect(warlock.sheet.classChoices).toEqual({ invocations: ['armor-of-shadows'] });
  });

  it('rolls 4d6 with the lowest dropped, the highest to the ability ranked first', () => {
    const faces = [6, 6, 6, 1, 5, 5, 5, 1, 4, 4, 4, 1, 3, 3, 3, 1, 2, 2, 2, 1, 1, 1, 1, 1];
    let next = 0;
    const built = buildCharacter(
      choicesFor('wizard', {
        abilities: { method: 'rolled', priority: ['int', 'dex', 'con', 'wis', 'cha', 'str'] },
      }),
      () => faces[next++] ?? 1,
    );
    if (!built.ok) throw new Error(JSON.stringify(built.problems));
    // 18, 15, 12, 9, 6, 3 — then the Acolyte's +2 Wisdom and +1 Intelligence.
    expect(built.sheet.abilities).toEqual({ int: 19, dex: 15, con: 12, wis: 11, cha: 6, str: 3 });
  });

  it('names every choice that does not hold', () => {
    const fields = (more: Partial<CharacterChoices>) => {
      const built = buildCharacter(choicesFor('fighter', more), d6);
      return built.ok ? [] : built.problems.map((problem) => problem.field);
    };
    expect(
      fields({
        abilities: {
          method: 'point-buy',
          base: { str: 15, dex: 15, con: 15, int: 9, wis: 8, cha: 8 },
        },
      }),
    ).toEqual(['abilities']);
    expect(
      fields({
        abilities: {
          method: 'standard-array',
          base: { str: 15, dex: 15, con: 13, int: 12, wis: 10, cha: 8 },
        },
      }),
    ).toEqual(['abilities']);
    expect(fields({ increases: { plus2: 'str', plus1: 'int' } })).toEqual(['increases']);
    expect(fields({ skills: ['athletics', 'athletics'] })).toContain('skills');
    expect(fields({ skills: ['arcana', 'athletics'] })).toEqual(['skills']);
    expect(fields({ fightingStyle: undefined })).toEqual(['fightingStyle']);
    expect(fields({ weaponMasteries: ['longsword'] })).toEqual(['weaponMasteries']);
    expect(fields({ equipment: { classOption: 'C', backgroundOption: 'A', picks: [] } })).toEqual([
      'equipment.picks',
    ]);
    expect(fields({ speciesOption: 'red' })).toEqual(['speciesOption']);
    expect(fields({ originFeat: 'alert' })).toEqual(['originFeat']);
    expect(fields({ cantrips: ['fire-bolt'] })).toEqual(['spells']);
  });

  it('lets a Human choose another Origin feat, and a Dragonborn its ancestor', () => {
    const human = buildCharacter(
      choicesFor('rogue', {
        speciesId: 'human',
        size: 'small',
        originFeat: 'skilled',
        moreSkills: ['history', 'nature', 'medicine', 'survival'],
      }),
      d6,
    );
    if (!human.ok) throw new Error(JSON.stringify(human.problems));
    expect(human.sheet.size).toBe('small');
    expect(human.sheet.feats).toEqual(['magic-initiate', 'skilled']);
    expect(human.sheet.skills.proficient).toHaveLength(2 + 4 + 4);
    const dragonborn = buildCharacter(
      choicesFor('paladin', { speciesId: 'dragonborn', speciesOption: 'red' }),
      d6,
    );
    if (!dragonborn.ok) throw new Error(JSON.stringify(dragonborn.problems));
    expect(dragonborn.sheet.resistances).toEqual(['fire']);
    expect(SRD_FEATS.find((feat) => feat.featId === 'skilled')?.repeatable).toBe(true);
  });
});
