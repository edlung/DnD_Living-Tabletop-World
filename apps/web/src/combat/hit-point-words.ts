import type { EncounterCombatantView, ObjectMaterial, ObjectSize } from '@ltw/contracts';
import { readableLabel, type Translate } from '@ltw/ui';

/**
 * Hit points beyond current and maximum (docs/adr/0048-hit-points.md §1, §2): the temporary ones,
 * lost first, and how far an effect lowered the maximum. Null when there are none.
 */
export const temporaryWords = (
  t: Translate,
  hp: { readonly temporary?: number | undefined },
): string | null =>
  hp.temporary === undefined ? null : t('+{amount} temporary', { amount: hp.temporary });

export const loweredWords = (
  t: Translate,
  hp: { readonly reducedBy?: number | undefined },
): string | null =>
  hp.reducedBy === undefined ? null : t('Maximum lowered by {amount}', { amount: hp.reducedBy });

/** What an object is made of, as the SRD's Armor Class table groups it (ADR 0048 §5). */
export const MATERIAL_WORDS: Readonly<Record<ObjectMaterial, string>> = {
  cloth: 'Cloth, paper or rope',
  glass: 'Crystal, glass or ice',
  wood: 'Wood',
  stone: 'Stone',
  iron: 'Iron or steel',
  mithral: 'Mithral',
  adamantine: 'Adamantine',
};

export const SIZE_WORDS: Readonly<Record<ObjectSize, string>> = {
  tiny: 'Tiny',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

/** The SRD's examples of each size, beside it in the DM's choice. */
export const SIZE_EXAMPLES: Readonly<Record<ObjectSize, string>> = {
  tiny: 'Tiny: a bottle, a lock',
  small: 'Small: a chest, a lute',
  medium: 'Medium: a barrel, a chandelier',
  large: 'Large: a cart, a dining table',
};

/** An object's material and size: "Wood · Large". */
export const objectWords = (
  t: Translate,
  object: NonNullable<EncounterCombatantView['object']>,
): string => `${t(MATERIAL_WORDS[object.material])}\u00a0· ${t(SIZE_WORDS[object.size])}`;

/** A combatant's state: up, down or dead; an object whole or destroyed. */
export const stateWords = (t: Translate, combatant: EncounterCombatantView): string =>
  combatant.object
    ? combatant.state === 'dead'
      ? t('Destroyed')
      : objectWords(t, combatant.object)
    : combatant.form !== undefined
      ? // A Druid in Wild Shape's form (docs/adr/0056-characters-from-the-srd.md §5).
        t('{state}, in the shape of: {form}', {
          state: t(readableLabel(combatant.state)),
          form: combatant.form,
        })
      : t(readableLabel(combatant.state));

/** A combatant's side, or "Object" for a thing in the fight. */
export const sideWords = (t: Translate, combatant: EncounterCombatantView): string =>
  combatant.object ? t('Object') : t(readableLabel(combatant.side));
