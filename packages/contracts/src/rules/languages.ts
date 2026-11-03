import { z } from 'zod';

/**
 * The languages a character knows (SRD 5.2.1, Character Creation step 2; docs/adr/0056-characters-
 * from-the-srd.md §2): every character knows Common and two of the standard languages; a Druid
 * knows Druidic, a Rogue Thieves' Cant and one more of either table, a Ranger two more at level 2.
 */
export const STANDARD_LANGUAGES = [
  'common',
  'common-sign-language',
  'draconic',
  'dwarvish',
  'elvish',
  'giant',
  'gnomish',
  'goblin',
  'halfling',
  'orc',
] as const;
export const RARE_LANGUAGES = [
  'abyssal',
  'celestial',
  'deep-speech',
  'druidic',
  'infernal',
  'primordial',
  'sylvan',
  'thieves-cant',
  'undercommon',
] as const;
export const SRD_LANGUAGES = [...STANDARD_LANGUAGES, ...RARE_LANGUAGES] as const;
export type SrdLanguage = (typeof SRD_LANGUAGES)[number];
export const srdLanguageSchema = z.enum(SRD_LANGUAGES);

/** Each language's English name, the client's dictionary key. */
export const LANGUAGE_NAMES: Readonly<Record<SrdLanguage, string>> = {
  common: 'Common',
  'common-sign-language': 'Common Sign Language',
  draconic: 'Draconic',
  dwarvish: 'Dwarvish',
  elvish: 'Elvish',
  giant: 'Giant',
  gnomish: 'Gnomish',
  goblin: 'Goblin',
  halfling: 'Halfling',
  orc: 'Orc',
  abyssal: 'Abyssal',
  celestial: 'Celestial',
  'deep-speech': 'Deep Speech',
  druidic: 'Druidic',
  infernal: 'Infernal',
  primordial: 'Primordial',
  sylvan: 'Sylvan',
  'thieves-cant': 'Thieves’ Cant',
  undercommon: 'Undercommon',
};
