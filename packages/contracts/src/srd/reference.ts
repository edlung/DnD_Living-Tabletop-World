import { z } from 'zod';

import { srdIdSchema } from './catalog.ts';

/**
 * The SRD's rules as a reference (docs/adr/0055-rules-reference-and-toolbox.md §1): the Rules
 * Glossary's entries, and the Gameplay Toolbox's and the magic items' rules as sections, each in
 * blocks — a paragraph with its run-in head apart ("Fever"; a label keeps its colon, "Trigger:"), a
 * bulleted item, a list of names, a table. English as the SRD gives it, read only.
 */
export const SRD_GLOSSARY_TAGS = [
  'Action',
  'Area of Effect',
  'Attitude',
  'Condition',
  'Hazard',
] as const;
export type SrdGlossaryTag = (typeof SRD_GLOSSARY_TAGS)[number];

const words = (max: number) => z.string().min(1).max(max);

export const srdBlockSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('paragraph'),
      head: words(80).nullable(),
      text: words(4000),
    })
    .strict(),
  z
    .object({
      kind: z.literal('item'),
      head: words(80).nullable(),
      text: words(2000),
    })
    .strict(),
  z.object({ kind: z.literal('names'), names: z.array(words(60)).min(1).max(40) }).strict(),
  z
    .object({
      kind: z.literal('table'),
      title: words(80).nullable(),
      columns: z.array(words(60)).min(1).max(8),
      rows: z
        .array(z.array(z.string().max(1000)).min(1).max(8))
        .min(1)
        .max(40),
      /** The footnotes under it ("*Halve the value for a consumable item …"). */
      notes: z.array(words(400)).max(4),
    })
    .strict(),
]);
export type SrdBlock = z.infer<typeof srdBlockSchema>;

export const srdGlossaryEntrySchema = z
  .object({
    entryId: srdIdSchema,
    name: words(60),
    tag: z.enum(SRD_GLOSSARY_TAGS).nullable(),
    blocks: z.array(srdBlockSchema).min(1).max(40),
    /** The glossary's entries its "See also" names. */
    seeAlso: z.array(srdIdSchema).max(12),
  })
  .strict();
export type SrdGlossaryEntry = z.infer<typeof srdGlossaryEntrySchema>;

export const srdAbbreviationSchema = z
  .object({ abbreviation: words(8), meaning: words(40) })
  .strict();
export type SrdAbbreviation = z.infer<typeof srdAbbreviationSchema>;

export const srdGlossarySchema = z
  .object({
    abbreviations: z.array(srdAbbreviationSchema).min(1).max(80),
    entries: z.array(srdGlossaryEntrySchema).min(1).max(400),
  })
  .strict();
export type SrdGlossary = z.infer<typeof srdGlossarySchema>;

/** Where a section stands: the Gameplay Toolbox (pages 192–203) or the magic items' rules. */
export const SRD_RULES_PARTS = ['toolbox', 'magic-items'] as const;
export type SrdRulesPart = (typeof SRD_RULES_PARTS)[number];

export const srdRulesSectionSchema = z
  .object({
    sectionId: srdIdSchema,
    part: z.enum(SRD_RULES_PARTS),
    title: words(80),
    /** 1: a chapter; 2: a section; 3: a subsection; 4: an entry (a trap, a contagion, a poison). */
    level: z.number().int().min(1).max(4),
    /** The line under an entry's name: "Deadly Trap (Levels 1–4)", "Magical Contagion". */
    subtitle: words(80).nullable(),
    blocks: z.array(srdBlockSchema).max(60),
  })
  .strict();
export type SrdRulesSection = z.infer<typeof srdRulesSectionSchema>;

/**
 * The reference as the server gives it (docs/adr/0055-rules-reference-and-toolbox.md §2): the
 * index for everyone at the table — every entry's name and tag, the abbreviations — with the
 * toolbox's sections for the DM alone; an entry or a section on its own, in the language it is
 * written in (English until its Russian exists, §5).
 */
export interface RulesIndexEntry {
  readonly entryId: string;
  readonly name: string;
  readonly tag: SrdGlossaryTag | null;
}
export interface RulesIndexSection {
  readonly sectionId: string;
  readonly part: SrdRulesPart;
  readonly title: string;
  readonly level: number;
  readonly subtitle: string | null;
}
export interface RulesIndexResponse {
  readonly abbreviations: readonly SrdAbbreviation[];
  readonly entries: readonly RulesIndexEntry[];
  /** Null for a player: the toolbox (traps, contagions) is the DM's. */
  readonly sections: readonly RulesIndexSection[] | null;
  readonly language: 'en' | 'ru';
}
export interface RulesEntryResponse {
  readonly entry: SrdGlossaryEntry;
  readonly language: 'en' | 'ru';
}
/** A section with the sections under it ("Traps": its parts, then each example trap). */
export interface RulesSectionResponse {
  readonly sections: readonly SrdRulesSection[];
  readonly language: 'en' | 'ru';
}
