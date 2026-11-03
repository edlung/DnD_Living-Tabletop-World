import type { CharacterChoices, ClassId } from '@ltw/contracts';

import { classCasting, classSpellList } from '../builder/spells.ts';
import { srdClass } from '../srd/classes.ts';

/**
 * Valid builder choices for a class (test support, docs/adr/0056-characters-from-the-srd.md §2):
 * a Dwarf Acolyte with the standard array, the first options of each list.
 */
export function choicesFor(
  classId: ClassId,
  more: Partial<CharacterChoices> = {},
): CharacterChoices {
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
    // Two standard languages, and a Rogue's one more (SRD 5.2.1).
    languages: classId === 'rogue' ? ['dwarvish', 'elvish', 'sylvan'] : ['dwarvish', 'elvish'],
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
