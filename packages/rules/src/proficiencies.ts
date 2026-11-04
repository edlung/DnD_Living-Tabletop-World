import {
  LANGUAGE_NAMES,
  RARE_LANGUAGES,
  SRD_LANGUAGES,
  type CharacterProficiencies,
  type CharacterSheet,
  type SrdLanguage,
} from '@ltw/contracts';

import { srdEquipment } from './srd/catalog.ts';
import { equipmentIn } from './srd/catalogs-ru.ts';
import { srdBackground, srdFeat, srdSpecies } from './srd/origins.ts';
import type { ReferenceLanguage } from './srd/reference-ru.ts';
import { backgroundIn, featIn, speciesIn } from './srd/russian-characters.ts';

/**
 * What a character knows beside its numbers (docs/adr/0056-characters-from-the-srd.md §2): its
 * species and background, its feats, the tools it is proficient with and the languages it knows,
 * each named in the campaign's language — the client shows them as they come.
 */
const RUSSIAN: Readonly<Record<SrdLanguage, string>> = {
  common: 'Общий',
  'common-sign-language': 'Общий язык жестов',
  draconic: 'Драконий',
  dwarvish: 'Дварфийский',
  elvish: 'Эльфийский',
  giant: 'Великаний',
  gnomish: 'Гномий',
  goblin: 'Гоблинский',
  halfling: 'Язык полуросликов',
  orc: 'Орочий',
  abyssal: 'Язык Бездны',
  celestial: 'Небесный',
  'deep-speech': 'Глубинная речь',
  druidic: 'Друидический',
  infernal: 'Инфернальный',
  primordial: 'Первичный',
  sylvan: 'Сильван',
  'thieves-cant': 'Воровской жаргон',
  undercommon: 'Подземный',
};

const RARE: ReadonlySet<SrdLanguage> = new Set(RARE_LANGUAGES);

/** A language's name in the campaign's language. */
export const languageName = (id: SrdLanguage, language: ReferenceLanguage): string =>
  language === 'ru' ? RUSSIAN[id] : LANGUAGE_NAMES[id];

/** Every language the builder offers, in the campaign's language, the rare ones marked. */
export const languageOptions = (language: ReferenceLanguage) =>
  SRD_LANGUAGES.map((languageId) => ({
    languageId,
    name: languageName(languageId, language),
    rare: RARE.has(languageId),
  }));

export function proficienciesOf(
  sheet: CharacterSheet,
  language: ReferenceLanguage,
): CharacterProficiencies {
  const species = sheet.origin ? srdSpecies(sheet.origin.speciesId) : undefined;
  const background = sheet.origin ? srdBackground(sheet.origin.backgroundId) : undefined;
  return {
    species: species ? speciesIn(species, language).value.name : null,
    background: background ? backgroundIn(background, language).value.name : null,
    feats: (sheet.feats ?? []).map((id) => {
      const feat = srdFeat(id);
      return feat ? featIn(feat, language).value.name : id;
    }),
    tools: (sheet.tools ?? []).map((id) => {
      const tool = srdEquipment(id.replace(/^srd-/, ''));
      return tool ? equipmentIn(tool, language).value.name : id;
    }),
    languages: (sheet.languages ?? []).map((id) => languageName(id, language)),
  };
}
