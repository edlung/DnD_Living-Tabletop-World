import type { Ability, CharacterDerived, CharacterSheet, Skill, SpellId } from '@ltw/contracts';
import { readableLabel, type Translate } from '@ltw/ui';

/**
 * The character dialog's words (Stage 500). Every sentence is an English key the client dictionary
 * translates (docs/adr/0031-play-language.md §10); rule numbers come from the server's `derived`.
 */
export const ABILITY_ORDER: readonly Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_NAMES: Readonly<Record<Ability, string>> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

/** The three-letter abbreviations on the ability tiles. */
export const ABILITY_SHORT: Readonly<Record<Ability, string>> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
};

/** A modifier as people write it: "+4", "−1", "+0" (a true minus sign). */
export const signed = (value: number): string =>
  value < 0 ? `−${String(-value)}` : `+${String(value)}`;

/** Dice with a modifier as people write them: "1d8 + 4", "2d6", "1d4 − 1". */
export function diceWords(dice: {
  readonly count: number;
  readonly sides: number;
  readonly bonus: number;
}): string {
  const base = `${String(dice.count)}d${String(dice.sides)}`;
  if (dice.bonus === 0) return base;
  return `${base} ${dice.bonus < 0 ? '\u2212' : '+'} ${String(Math.abs(dice.bonus))}`;
}

/** Skill names whose small words stay small ("Sleight of Hand"); others read as their token. */
const SKILL_WORDS: Partial<Record<Skill, string>> = { 'sleight-of-hand': 'Sleight of Hand' };

export function skillName(t: Translate, skill: Skill): string {
  const words = SKILL_WORDS[skill];
  return words === undefined ? readableLabel(skill, t) : t(words);
}

/** A slice spell's name from the dictionary; any other SRD spell's, its English name until translated. */
export const spellName = (t: Translate, spellId: string, name?: string): string =>
  isSliceSpellId(spellId) || name === undefined ? readableLabel(spellId, t) : t(name);

export const isSliceSpellId = (spellId: string): spellId is SpellId =>
  Object.hasOwn(SPELL_TEXT, spellId);

export const className = (t: Translate, classId: string): string => readableLabel(classId, t);

/** "Ranger 7 · Hunter" for each class the sheet records. */
export function classLine(t: Translate, classes: CharacterSheet['classes']): string {
  return classes
    .map(
      (entry) =>
        `${className(t, entry.classId)} ${String(entry.level)}${entry.subclass ? ` (${t(entry.subclass)})` : ''}`,
    )
    .join(' · ');
}

type Spell = CharacterDerived['spells'][number];

export const castingTimeWords = (t: Translate, time: Spell['castingTime']): string =>
  ({
    action: t('Action'),
    bonus: t('Bonus action'),
    reaction: t('Reaction'),
    long: t('Minutes or hours'),
  })[time];

/** A slice spell's short rules text; an SRD spell's text comes with its catalog entry. */
export const sliceSpellText = (spellId: string): string | null =>
  isSliceSpellId(spellId) ? SPELL_TEXT[spellId] : null;

export const rangeWords = (t: Translate, range: Spell['range']): string =>
  range === 'self' ? t('Self') : t('{feet} ft', { feet: range });

export const spellLevelWords = (t: Translate, level: number): string =>
  level === 0 ? t('Cantrip') : t('Level {level} spell', { level });

/** What each spell does, in the project's own words (the engine's mechanics, not SRD text). */
export const SPELL_TEXT: Readonly<Record<SpellId, string>> = {
  'hunters-mark':
    'You mark a creature you can see. Your weapon hits deal it an extra 1d6 Force damage while you concentrate.',
  'detect-magic':
    'While you concentrate you sense magic within 30 feet and see a faint aura around enchanted things.',
  'healing-word':
    'A creature you can see within 60 feet regains 2d4 hit points plus your spellcasting modifier; more with a higher slot.',
  'misty-step': 'Wrapped in silver mist, you teleport up to 30 feet to a space you can see.',
  fireball:
    'A bead of flame bursts in a 20-foot radius: everyone there makes a Dexterity save, taking 8d6 Fire damage, half on a success.',
  counterspell:
    'As a reaction you interrupt a creature casting a spell within 60 feet: it makes a Constitution save or the spell fails.',
  shield:
    'As a reaction when an attack would hit you, a ward gives you +5 Armor Class until the start of your next turn, against that attack too.',
  'hellish-rebuke':
    'As a reaction when a creature you can see within 60 feet damages you, it takes 2d10 Fire damage, half on a Dexterity save; more with a higher slot.',
  'feather-fall':
    'As a reaction when you or a creature you can see within 60 feet falls, up to five falling creatures there drift down and land on their feet, taking no damage from the fall.',
};
