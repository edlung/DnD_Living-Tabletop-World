import type { CharacterSheet, MetamagicChoice } from '@ltw/contracts';
import type { CombatantRecord, Dice } from '@ltw/domain';
import { charismaCount } from '@ltw/rules';

/**
 * What Metamagic changes in a spell's effects (docs/adr/0056-characters-from-the-srd.md §4): the
 * creatures Careful Spell spares (the caster's allies in the area unless named, as many as its
 * Charisma modifier), Heightened Spell's creature (its first target unless named), Empowered
 * Spell's lowest dice rolled again, and Transmuted Spell's damage type.
 */
export interface MetamagicEffects {
  readonly spared: ReadonlySet<string>;
  readonly heightened: string | null;
  readonly empowered: number;
  readonly seeking: boolean;
  readonly transmuted: string | null;
}

const NONE: MetamagicEffects = {
  spared: new Set(),
  heightened: null,
  empowered: 0,
  seeking: false,
  transmuted: null,
};

export function metamagicEffects(
  choice: MetamagicChoice | null,
  sheet: CharacterSheet,
  caster: CombatantRecord | null,
  reached: readonly CombatantRecord[],
  firstTargetId: string | null,
): MetamagicEffects {
  if (!choice) return NONE;
  const has = (option: MetamagicChoice['options'][number]) => choice.options.includes(option);
  const allies = caster
    ? reached
        .filter((one) => one.side === caster.side && one.entityId !== caster.entityId)
        .map((one) => one.entityId)
    : [];
  return {
    spared: new Set(
      has('careful-spell') ? (choice.careful ?? allies).slice(0, charismaCount(sheet)) : [],
    ),
    heightened: has('heightened-spell')
      ? (choice.heightened ??
        firstTargetId ??
        reached.find((one) => caster === null || one.side !== caster.side)?.entityId ??
        null)
      : null,
    empowered: has('empowered-spell') ? charismaCount(sheet) : 0,
    seeking: has('seeking-spell'),
    transmuted: has('transmuted-spell') ? (choice.transmuted ?? null) : null,
  };
}

const TRANSMUTABLE: ReadonlySet<string> = new Set([
  'acid',
  'cold',
  'fire',
  'lightning',
  'poison',
  'thunder',
]);

/** Transmuted Spell: a listed type becomes the chosen one; others stay. */
export const transmute = (type: string, effects: MetamagicEffects): string =>
  effects.transmuted !== null && TRANSMUTABLE.has(type) ? effects.transmuted : type;

/** Empowered Spell: the lowest dice rolled again, as many as allowed, the new rolls kept. */
export function empower(
  dice: Dice,
  rolled: { readonly rolls: readonly number[]; readonly total: number },
  sides: number,
  count: number,
): { readonly rolls: readonly number[]; readonly total: number } {
  if (count <= 0 || rolled.rolls.length === 0) return rolled;
  const order = rolled.rolls
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value)
    .slice(0, count);
  const rolls = [...rolled.rolls];
  for (const { index } of order) rolls[index] = dice.roll(sides);
  const before = rolled.rolls.reduce((sum, value) => sum + value, 0);
  const after = rolls.reduce((sum, value) => sum + value, 0);
  return { rolls, total: rolled.total - before + after };
}
