import { z } from 'zod';

import { worldTimeSchema } from '../kernel/world-time.ts';

/**
 * Chronicle (docs/adr/0024-chronicle.md; owner decisions of 2026-10-04). A
 * chapter is a set of deterministic entries, each traceable to source
 * events, plus prose rendered from those entries only. Every paragraph cites
 * the entries it tells. The DM generates chapters; a chapter is recorded in
 * the campaign's history, never as a world fact.
 */
export const CHRONICLE_LIMITS = {
  entries: 40,
  paragraphs: 40,
  paragraphChars: 1500,
  citesPerParagraph: 20,
  titleChars: 120,
} as const;

/** Entries are cited by opaque keys `e1…en`, in chapter order. */
export const chronicleEntryKeySchema = z.string().regex(/^e[1-9][0-9]{0,2}$/);

export const chronicleParagraphSchema = z
  .object({
    text: z.string().trim().min(1).max(CHRONICLE_LIMITS.paragraphChars),
    cites: z.array(chronicleEntryKeySchema).min(1).max(CHRONICLE_LIMITS.citesPerParagraph),
  })
  .strict();
export type ChronicleParagraph = z.infer<typeof chronicleParagraphSchema>;

/** The structured output every chronicle renderer must return. */
export const chronicleOutputSchema = z
  .object({
    paragraphs: z.array(chronicleParagraphSchema).min(1).max(CHRONICLE_LIMITS.paragraphs),
  })
  .strict();

export const chronicleProseSchema = chronicleOutputSchema
  .extend({
    /** The provider that wrote it (`anthropic`, `local`), or `template` when no provider could. */
    provider: z.string().min(1).max(40),
    model: z.string().min(1).max(100),
    /** The AI trace of the rendering; null when no AI request was made. */
    traceId: z.string().min(1).max(100).nullable(),
  })
  .strict();
export type ChronicleProse = z.infer<typeof chronicleProseSchema>;

export const generateChronicleCommandSchema = z
  .object({
    type: z.literal('GenerateChronicle'),
    title: z.string().trim().min(1).max(CHRONICLE_LIMITS.titleChars),
    /** The perspective label the chapter is told from: `PARTY`, `CHARACTER:<id>`, `PUBLIC`, `NPC:<id>`, or `DM`. */
    perspective: z.string().min(1).max(100),
    from: worldTimeSchema,
    to: worldTimeSchema,
    prose: chronicleProseSchema,
  })
  .strict();
