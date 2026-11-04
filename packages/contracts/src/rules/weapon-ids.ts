/**
 * The weapons the rules know (SRD 5.2.1 mechanics; `@ltw/rules` WEAPONS). The longbow came first;
 * the next joined with the Ravenford weapons of the item catalog (Stage 520); the rest of the SRD's
 * weapon table with the weapons' rules (docs/adr/0047-weapons.md), and its firearms with the SRD's
 * equipment (docs/adr/0054-items-as-data.md §1). Only grows.
 */
export const WEAPON_IDS = [
  'longbow',
  'shortbow',
  'light-crossbow',
  'dagger',
  'shortsword',
  'longsword',
  'rapier',
  'scimitar',
  'handaxe',
  'battleaxe',
  'mace',
  'warhammer',
  'quarterstaff',
  'spear',
  'club',
  'greatclub',
  'javelin',
  'light-hammer',
  'sickle',
  'dart',
  'sling',
  'flail',
  'glaive',
  'greataxe',
  'greatsword',
  'halberd',
  'lance',
  'maul',
  'morningstar',
  'pike',
  'trident',
  'war-pick',
  'whip',
  'blowgun',
  'hand-crossbow',
  'heavy-crossbow',
  'musket',
  'pistol',
] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

/** The weapon masteries (SRD 5.2.1; docs/adr/0047-weapons.md §2). */
export const WEAPON_MASTERIES = [
  'cleave',
  'graze',
  'nick',
  'push',
  'sap',
  'slow',
  'topple',
  'vex',
] as const;
export type WeaponMastery = (typeof WEAPON_MASTERIES)[number];

/** The SRD's damage types (SRD 5.2.1). */
export const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];
