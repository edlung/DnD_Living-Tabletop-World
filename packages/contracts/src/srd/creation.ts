import { z } from 'zod';

import { ABILITIES, SKILL_IDS } from '../rules/character-sheet.ts';

/**
 * What the SRD gives a new character, as data the builder reads (docs/adr/0056-characters-from-
 * the-srd.md §2): a class's Hit Point Die, saving throws, skills to choose, tools and starting
 * equipment, a background's tool and equipment. The import reads them from the core traits' words
 * and finds each named piece of equipment in the item catalog; what the words leave to the player
 * ("a Musical Instrument of your choice") is a pick among the catalog's entries of that kind.
 */
const catalogId = z.string().regex(/^srd-[a-z0-9]+(-[a-z0-9]+)*$/);

export const SRD_PICK_KINDS = [
  'musical-instrument',
  'holy-symbol',
  'gaming-set',
  'artisans-tools',
  'artisans-tools-or-musical-instrument',
] as const;
export type SrdPickKind = (typeof SRD_PICK_KINDS)[number];

/** A pick among the catalog's entries of a kind. */
export const srdPickSchema = z
  .object({
    kind: z.enum(SRD_PICK_KINDS),
    from: z.array(catalogId).min(2).max(40),
  })
  .strict();
export type SrdPick = z.infer<typeof srdPickSchema>;

/** One starting equipment option: "(A) Greataxe, 4 Handaxes, Explorer's Pack, and 15 GP". */
export const srdStartingOptionSchema = z
  .object({
    label: z.enum(['A', 'B', 'C']),
    items: z
      .array(z.object({ catalogId, quantity: z.number().int().min(1).max(50) }).strict())
      .max(14),
    picks: z.array(srdPickSchema).max(2),
    gp: z.number().int().min(0).max(500),
  })
  .strict();
export type SrdStartingOption = z.infer<typeof srdStartingOptionSchema>;

/** Tool proficiencies: fixed ones, and a number to pick among a kind. */
export const srdToolsSchema = z
  .object({
    fixed: z.array(catalogId).max(3),
    pick: srdPickSchema
      .extend({ count: z.number().int().min(1).max(3) })
      .strict()
      .nullable(),
  })
  .strict();
export type SrdTools = z.infer<typeof srdToolsSchema>;

export const srdClassCreationSchema = z
  .object({
    hitDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
    savingThrows: z.array(z.enum(ABILITIES)).length(2),
    skills: z
      .object({
        choose: z.number().int().min(1).max(4),
        from: z.array(z.enum(SKILL_IDS)).min(2).max(SKILL_IDS.length),
      })
      .strict(),
    tools: srdToolsSchema,
    equipment: z.array(srdStartingOptionSchema).min(2).max(3),
  })
  .strict();
export type SrdClassCreation = z.infer<typeof srdClassCreationSchema>;

export const srdBackgroundCreationSchema = z
  .object({
    tools: srdToolsSchema,
    equipment: z.array(srdStartingOptionSchema).length(2),
  })
  .strict();
export type SrdBackgroundCreation = z.infer<typeof srdBackgroundCreationSchema>;
