import { effectiveMaximum, type CharacterSheet } from '@ltw/contracts';

import { d20Test, rollDamage, type D20Result, type DamageRoll } from './d20.ts';
import type { Dice } from './dice.ts';

/** Spell effects for the slice (SRD 5.2.1 mechanics; docs/adr/0011-ruleset-srd-5-2.md). */

/** Healing Word: 2d4 + spellcasting modifier, +2d4 per slot level above 1. */
export function rollHealingWord(
  dice: Dice,
  slotLevel: number,
  abilityModifier: number,
): DamageRoll {
  return rollDamage(dice, 2 * Math.max(1, slotLevel), 4, abilityModifier);
}

/** Fireball: one damage roll of 8d6 (+1d6 per slot level above 3), Dexterity save for half. */
export function resolveFireball(
  dice: Dice,
  slotLevel: number,
  dc: number,
  targets: readonly { readonly id: string; readonly dexSaveModifier: number }[],
): { damage: DamageRoll; results: { id: string; save: D20Result; damage: number }[] } {
  const damage = rollDamage(dice, 8 + Math.max(0, slotLevel - 3), 6, 0);
  const results = targets.map((target) => {
    const save = d20Test(dice, { modifier: target.dexSaveModifier, target: dc });
    return {
      id: target.id,
      save,
      damage: save.success ? Math.floor(damage.total / 2) : damage.total,
    };
  });
  return { damage, results };
}

/** Hit Points never drop below 0 or rise above the maximum (as an effect may have lowered it). */
export function applyHitPointChange(sheet: CharacterSheet, delta: number): CharacterSheet {
  const ceiling = effectiveMaximum(sheet.hitPoints);
  const current = Math.min(ceiling, Math.max(0, sheet.hitPoints.current + delta));
  return { ...sheet, hitPoints: { ...sheet.hitPoints, current } };
}

/** Ability check with the sheet's skill modifier (ties succeed; no natural 20/1 rule). */
export function resolveCheck(
  dice: Dice,
  modifier: number,
  dc: number,
  options: { readonly advantage?: boolean; readonly disadvantage?: boolean } = {},
): D20Result {
  return d20Test(dice, { modifier, target: dc, ...options });
}
