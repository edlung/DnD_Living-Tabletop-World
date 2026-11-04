import { METAMAGIC_OPTIONS, type CharacterSheet, type MetamagicId } from '@ltw/contracts';

import { abilityModifier } from '../character-math.ts';
import type { SpellRules } from '../spell-rules.ts';
import { srdClass } from '../srd/classes.ts';
import { resourceOf } from './resources.ts';

/**
 * Metamagic as a Sorcerer casts (SRD 5.2.1; docs/adr/0056-characters-from-the-srd.md §4): the
 * options it knows, their cost in Sorcery Points from the option's words, and what the World Engine
 * changes — Quickened's Bonus Action, Distant's range, Twinned's added creature, Heightened's
 * Disadvantage, Careful's creatures spared, Empowered's rerolled dice, Seeking's rerolled d20,
 * Transmuted's damage type, Extended's Advantage to keep Concentration. Subtle and Extended's
 * duration are the DM's.
 */
const STACKS: ReadonlySet<MetamagicId> = new Set(['empowered-spell', 'seeking-spell']);

/** An option's cost in Sorcery Points, as its words give it ("2 Sorcery Points"). */
export function metamagicCost(optionId: MetamagicId): number {
  const option = srdClass('sorcerer')?.options?.entries.find((one) => one.optionId === optionId);
  return Number(/\d+/.exec(option?.cost ?? '')?.[0] ?? 1);
}

export type MetamagicRefusal = 'NOT_A_FEATURE' | 'NO_USES_LEFT' | 'ONE_METAMAGIC';

/** Why these options cannot be spent on a cast: unknown, more than one that does not stack, or points. */
export function metamagicRefusal(
  sheet: CharacterSheet,
  options: readonly MetamagicId[],
): MetamagicRefusal | null {
  const known = sheet.classChoices?.metamagic ?? [];
  if (options.some((option) => !known.includes(option))) return 'NOT_A_FEATURE';
  if (new Set(options).size !== options.length) return 'ONE_METAMAGIC';
  if (options.filter((option) => !STACKS.has(option)).length > 1) return 'ONE_METAMAGIC';
  const cost = options.reduce((sum, option) => sum + metamagicCost(option), 0);
  return (resourceOf(sheet, 'sorcery-points')?.left ?? 0) < cost ? 'NO_USES_LEFT' : null;
}

/** The points the options cost in all. */
export const metamagicTotal = (options: readonly MetamagicId[]): number =>
  options.reduce((sum, option) => sum + metamagicCost(option), 0);

/** How many creatures Careful Spell spares and Empowered Spell's dice: the Charisma modifier, 1 at least. */
export const charismaCount = (sheet: CharacterSheet): number =>
  Math.max(1, abilityModifier(sheet.abilities.cha));

/** Distant Spell's range: doubled from 5 ft or more; Touch becomes 30 ft. */
export const distantRangeFt = (rangeFt: number): number => (rangeFt <= 5 ? 30 : rangeFt * 2);

const TRANSMUTABLE: ReadonlySet<string> = new Set([
  'acid',
  'cold',
  'fire',
  'lightning',
  'poison',
  'thunder',
]);
const LASTING: ReadonlySet<string> = new Set(['minute', 'hour', 'day']);

/** Whether an option fits a spell as its data gives it. */
function fits(option: MetamagicId, rules: SpellRules): boolean {
  const mechanics = rules.mechanics;
  const effect = mechanics?.effect;
  const damages =
    effect?.kind === 'attack' || effect?.kind === 'save'
      ? effect.damage
      : effect?.kind === 'auto'
        ? [effect.damage]
        : [];
  switch (option) {
    case 'quickened-spell':
      return rules.castingTime === 'action';
    case 'distant-spell':
      return rules.range !== 'self';
    case 'twinned-spell':
      return (mechanics?.upcast?.targets ?? 0) > 0;
    case 'careful-spell':
    case 'heightened-spell':
      return effect?.kind === 'save';
    case 'seeking-spell':
      return effect?.kind === 'attack';
    case 'empowered-spell':
      return damages.length > 0;
    case 'transmuted-spell':
      return damages.some((damage) => TRANSMUTABLE.has(damage.type));
    case 'extended-spell':
      return mechanics !== null && LASTING.has(mechanics.duration.unit);
    case 'subtle-spell':
      return true;
  }
}

/** The options a Sorcerer could spend on this spell now: known, fitting, and paid for. */
export function metamagicFor(
  sheet: CharacterSheet,
  rules: SpellRules,
): { readonly optionId: MetamagicId; readonly cost: number }[] {
  const known = sheet.classChoices?.metamagic ?? [];
  const left = resourceOf(sheet, 'sorcery-points')?.left ?? 0;
  return METAMAGIC_OPTIONS.flatMap((optionId) =>
    known.includes(optionId) && fits(optionId, rules) && metamagicCost(optionId) <= left
      ? [{ optionId, cost: metamagicCost(optionId) }]
      : [],
  );
}
