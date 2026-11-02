/** The SRD 5.2.1 catalogs' contracts (docs/adr/0051-srd-data.md), re-exported by the package index. */
export {
  SRD_CHALLENGE_PATTERN,
  SRD_SCHOOLS,
  SRD_SPELL_LISTS,
  srdEntrySchema,
  srdIdSchema,
  srdMonsterSchema,
  srdSpellSchema,
  type SrdEntry,
  type SrdMonster,
  type SrdSchool,
  type SrdSpell,
  type SrdSpellList,
} from './catalog.ts';
export {
  SPELL_AREA_SHAPES,
  SPELL_DURATION_UNITS,
  SPELL_RANGE_KINDS,
  SPELL_TIME_UNITS,
  spellDamageSchema,
  spellDiceSchema,
  spellEffectSchema,
  srdSpellMechanicsSchema,
  type SpellAreaShape,
  type SpellDamage,
  type SpellDice,
  type SpellEffect,
  type SrdSpellMechanics,
} from './spell-mechanics.ts';
export {
  addFromBestiaryRequestSchema,
  bestiaryMonsterIdSchema,
  type AddFromBestiaryRequest,
  type AddedFromBestiaryResponse,
  type BestiaryEntry,
  type BestiaryEntryResponse,
  type BestiaryResponse,
} from './bestiary.ts';
