import type { SrdAbbreviation, SrdGlossaryEntry, SrdRulesSection } from '@ltw/contracts';

import glossary from './glossary.json' with { type: 'json' };
import sections from './rules-sections.json' with { type: 'json' };

/**
 * The SRD's rules as a reference (docs/adr/0055-rules-reference-and-toolbox.md §1): the Rules
 * Glossary's entries and abbreviations, and the Gameplay Toolbox's and the magic items' rules as
 * sections in their order, written by `scripts/srd/import.ts`. Read only: nothing here decides.
 */
export const SRD_GLOSSARY: readonly SrdGlossaryEntry[] = glossary.entries;
export const SRD_ABBREVIATIONS: readonly SrdAbbreviation[] = glossary.abbreviations;
export const SRD_RULES_SECTIONS: readonly SrdRulesSection[] = sections;

const entriesById = new Map(SRD_GLOSSARY.map((entry) => [entry.entryId, entry]));
const sectionsById = new Map(SRD_RULES_SECTIONS.map((section) => [section.sectionId, section]));

export const srdGlossaryEntry = (entryId: string): SrdGlossaryEntry | undefined =>
  entriesById.get(entryId);
export const srdRulesSection = (sectionId: string): SrdRulesSection | undefined =>
  sectionsById.get(sectionId);
