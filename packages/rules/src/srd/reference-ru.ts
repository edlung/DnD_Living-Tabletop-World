import type { SrdAbbreviation, SrdGlossaryEntry, SrdRulesSection } from '@ltw/contracts';

import { SRD_ABBREVIATIONS } from './reference.ts';
import abbreviationsRu from './ru/abbreviations.json' with { type: 'json' };
import glossaryRu from './ru/glossary.json' with { type: 'json' };
import sectionsRu from './ru/rules-sections.json' with { type: 'json' };
import {
  abbreviationStrings,
  englishHash,
  glossaryEntryStrings,
  rulesSectionStrings,
  russianAbbreviations,
  russianGlossaryEntry,
  russianRulesSection,
  type KeptRussian,
  type Strings,
} from './russian.ts';

/**
 * The rules reference in a campaign's language (docs/adr/0055-rules-reference-and-toolbox.md §5):
 * a Russian campaign reads an entry's Russian while it is current — made from the English the
 * entry has now — and its English, marked so, until then.
 */
export type ReferenceLanguage = 'en' | 'ru';
export interface InLanguage<T> {
  readonly value: T;
  readonly language: ReferenceLanguage;
}

const current = (kept: KeptRussian | undefined, english: Strings): Strings | null =>
  kept !== undefined && kept.hash === englishHash(english) ? kept.ru : null;

export function glossaryEntryIn(
  entry: SrdGlossaryEntry,
  language: ReferenceLanguage,
): InLanguage<SrdGlossaryEntry> {
  const ru =
    language === 'ru' ? current(glossaryRu[entry.entryId], glossaryEntryStrings(entry)) : null;
  return ru === null
    ? { value: entry, language: 'en' }
    : { value: russianGlossaryEntry(entry, ru), language: 'ru' };
}

export function rulesSectionIn(
  section: SrdRulesSection,
  language: ReferenceLanguage,
): InLanguage<SrdRulesSection> {
  const ru =
    language === 'ru' ? current(sectionsRu[section.sectionId], rulesSectionStrings(section)) : null;
  return ru === null
    ? { value: section, language: 'en' }
    : { value: russianRulesSection(section, ru), language: 'ru' };
}

export function abbreviationsIn(
  language: ReferenceLanguage,
): InLanguage<readonly SrdAbbreviation[]> {
  const ru =
    language === 'ru'
      ? current(abbreviationsRu['all'], abbreviationStrings(SRD_ABBREVIATIONS))
      : null;
  return ru === null
    ? { value: SRD_ABBREVIATIONS, language: 'en' }
    : { value: russianAbbreviations(SRD_ABBREVIATIONS, ru), language: 'ru' };
}
