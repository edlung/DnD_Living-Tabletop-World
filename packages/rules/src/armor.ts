import type { CharacterSheet } from '@ltw/contracts';

/**
 * Armor's Strength and Stealth (SRD 5.2.1; docs/adr/0050-the-world-around.md §10): a wearer weaker
 * than its armor's Strength score has its Speed reduced by 10 ft; armor with Stealth's
 * Disadvantage gives it on Dexterity (Stealth) checks.
 */
export const ARMOR_SLOW_FT = 10;

export function armorSlowFt(sheet: Pick<CharacterSheet, 'abilities' | 'wornArmor'>): number {
  const strength = sheet.wornArmor?.strength;
  return strength !== undefined && sheet.abilities.str < strength ? ARMOR_SLOW_FT : 0;
}

export const armorHampersStealth = (sheet: Pick<CharacterSheet, 'wornArmor'>): boolean =>
  sheet.wornArmor?.stealthDisadvantage === true;
