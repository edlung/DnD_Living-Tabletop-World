import type {
  Ability,
  CharacterChoices,
  ChoiceProblem,
  ClassId,
  SpellcastingSource,
  SrdClass,
} from '@ltw/contracts';

import { SRD_SPELLS } from '../srd/catalog.ts';

/**
 * A new character's spells (SRD 5.2.1, each class's Spellcasting or Pact Magic at level 1;
 * docs/adr/0056-characters-from-the-srd.md §2): the cantrips and prepared spells its features
 * table counts, chosen from its list; a Wizard's six spellbook spells; a Ranger's Hunter's Mark
 * with Favored Enemy's free casts; the slots of the table's columns.
 */
export const CASTING_ABILITY: Partial<Readonly<Record<ClassId, Ability>>> = {
  bard: 'cha',
  cleric: 'wis',
  druid: 'wis',
  paladin: 'cha',
  ranger: 'wis',
  sorcerer: 'cha',
  warlock: 'cha',
  wizard: 'int',
};

export interface ClassCasting {
  readonly ability: Ability;
  readonly cantrips: number;
  readonly prepared: number;
  /** Slots by level, index 0 = level 1. */
  readonly slots: readonly number[];
}

const count = (value: string | undefined): number =>
  value === undefined || value === '—' ? 0 : Number(value);

/** A class's casting at a level, from its features table; null for a class without. */
export function classCasting(cls: SrdClass, classId: ClassId, level: number): ClassCasting | null {
  const ability = CASTING_ABILITY[classId];
  const row = cls.levels[level - 1];
  if (!ability || !row) return null;
  const at = (column: string) => {
    const index = cls.columns.indexOf(column);
    return index < 0 ? undefined : row.values[index];
  };
  const slots = Array.from({ length: 9 }, (_, index) => count(at(String(index + 1))));
  // Pact Magic: its slots all of one level.
  const pact = count(at('Spell Slots'));
  const pactLevel = Number(/\d/.exec(at('Slot Level') ?? '')?.[0] ?? 0);
  if (pact > 0 && pactLevel > 0) slots[pactLevel - 1] = pact;
  return {
    ability,
    cantrips: count(at('Cantrips')),
    prepared: count(at('Prepared Spells')),
    slots,
  };
}

/** The spells of a class's list at a spell level. */
export const classSpellList = (classId: ClassId | 'cleric' | 'druid' | 'wizard', level: number) =>
  SRD_SPELLS.filter(
    (spell) => spell.level === level && (spell.classes as readonly string[]).includes(classId),
  ).map((spell) => spell.spellId);

/** The words of a choice's problems: its own each, count and list sentences. */
interface ChoiceWords {
  readonly each: string;
  readonly count: string;
}
const CANTRIPS: ChoiceWords = { each: 'Each cantrip once', count: 'Choose {count} cantrips' };
const SPELLS: ChoiceWords = { each: 'Each spell once', count: 'Choose {count} spells' };
const SPELLBOOK: ChoiceWords = {
  each: 'Each spellbook spell once',
  count: 'Choose {count} spellbook spells',
};

function chooseFrom(
  chosen: readonly string[],
  allowed: readonly string[],
  wanted: number,
  field: string,
  words: ChoiceWords,
  problems: ChoiceProblem[],
): void {
  if (new Set(chosen).size !== chosen.length) problems.push({ field, message: words.each });
  if (chosen.length !== wanted)
    problems.push({ field, message: words.count, params: { count: wanted } });
  const outside = chosen.filter((id) => !allowed.includes(id));
  if (outside.length > 0)
    problems.push({
      field,
      message: 'Not on the list: {spells}',
      params: { spells: outside.join(', ') },
    });
}

/** The class's casting source on the sheet, and its slots. */
export function classSpellcasting(
  cls: SrdClass,
  choices: CharacterChoices,
  problems: ChoiceProblem[],
): { source: SpellcastingSource | null; slots: readonly number[] } {
  const casting = classCasting(cls, choices.classId, 1);
  const none = { source: null, slots: Array.from({ length: 9 }, () => 0) };
  if (!casting) {
    if (choices.cantrips.length + choices.spells.length + choices.spellbook.length > 0)
      problems.push({
        field: 'spells',
        message: '{class} casts no spells at level 1',
        params: { class: cls.name },
      });
    return none;
  }
  const extraCantrip = choices.order === 'thaumaturge' || choices.order === 'magician' ? 1 : 0;
  const cantripList = classSpellList(choices.classId, 0);
  chooseFrom(
    choices.cantrips,
    cantripList,
    casting.cantrips + extraCantrip,
    'cantrips',
    CANTRIPS,
    problems,
  );
  const levelOne = classSpellList(choices.classId, 1);
  if (choices.classId === 'wizard') {
    chooseFrom(choices.spellbook, levelOne, 6, 'spellbook', SPELLBOOK, problems);
    chooseFrom(choices.spells, choices.spellbook, casting.prepared, 'spells', SPELLS, problems);
  } else {
    if (choices.spellbook.length > 0)
      problems.push({ field: 'spellbook', message: 'Only a Wizard keeps a spellbook' });
    chooseFrom(choices.spells, levelOne, casting.prepared, 'spells', SPELLS, problems);
  }
  // Favored Enemy: Hunter's Mark always prepared, cast free as often as the table says.
  const favored = choices.classId === 'ranger' ? count(columnAt(cls, 'Favored Enemy', 1)) : 0;
  const spells = [
    ...new Set([...choices.cantrips, ...choices.spells, ...(favored > 0 ? ['hunters-mark'] : [])]),
  ];
  if (spells.length === 0) return { source: null, slots: casting.slots };
  return {
    source: {
      source: choices.classId as SpellcastingSource['source'],
      ability: casting.ability,
      spells,
      ...(favored > 0
        ? { freeCasts: { spellId: 'hunters-mark', perLongRest: favored, used: 0 } }
        : {}),
    },
    slots: casting.slots,
  };
}

function columnAt(cls: SrdClass, column: string, level: number): string | undefined {
  const index = cls.columns.indexOf(column);
  return index < 0 ? undefined : cls.levels[level - 1]?.values[index];
}

/** Magic Initiate's casting: two cantrips and a level 1 spell of its list, once free a day. */
export function magicInitiateCasting(
  choice: NonNullable<CharacterChoices['magicInitiate']>,
  problems: ChoiceProblem[],
): SpellcastingSource {
  chooseFrom(
    choice.cantrips,
    classSpellList(choice.list, 0),
    2,
    'magicInitiate.cantrips',
    CANTRIPS,
    problems,
  );
  chooseFrom(
    [choice.spell],
    classSpellList(choice.list, 1),
    1,
    'magicInitiate.spell',
    SPELLS,
    problems,
  );
  return {
    source: 'magic-initiate',
    ability: choice.ability,
    spells: [...choice.cantrips, choice.spell],
    freeCasts: { spellId: choice.spell, perLongRest: 1, used: 0 },
  };
}
