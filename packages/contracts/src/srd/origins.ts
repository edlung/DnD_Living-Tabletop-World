import { z } from 'zod';

import { ABILITIES, SKILL_IDS } from '../rules/character-sheet.ts';
import { srdIdSchema } from './catalog.ts';
import { srdBackgroundCreationSchema } from './creation.ts';
import { srdBlockSchema } from './reference.ts';

/**
 * The SRD's character origins and feats as it gives them (docs/adr/0056-characters-from-the-
 * srd.md §1): the four backgrounds — the three ability scores they raise, their origin feat,
 * skills, tool and equipment — the nine species with their traits, and the feats by category.
 * English, read only; the rules derive what a character gains from them.
 */
const words = (max: number) => z.string().min(1).max(max);

export const srdBackgroundSchema = z
  .object({
    backgroundId: srdIdSchema,
    name: words(40),
    /** The three scores it raises, +2 and +1 or +1 to each (the builder's choice). */
    abilityScores: z.array(z.enum(ABILITIES)).length(3),
    /** Its origin feat as written ("Magic Initiate (Cleric)") and the feat that names. */
    feat: words(60),
    featId: srdIdSchema,
    skills: z.array(z.enum(SKILL_IDS)).length(2),
    tool: words(120),
    equipment: words(400),
    /** Its tool and equipment as data (docs/adr/0056-…md §2). */
    creation: srdBackgroundCreationSchema,
  })
  .strict();
export type SrdBackground = z.infer<typeof srdBackgroundSchema>;

export const srdTraitSchema = z
  .object({ name: words(60), blocks: z.array(srdBlockSchema).min(1).max(20) })
  .strict();
export type SrdTrait = z.infer<typeof srdTraitSchema>;

export const srdSpeciesSchema = z
  .object({
    speciesId: srdIdSchema,
    name: words(40),
    creatureType: words(40),
    /** As written: "Medium (about 4–7 feet tall) or Small (about 2–4 feet tall), chosen …". */
    size: words(200),
    /** Its Speed in feet. */
    speed: z.number().int().min(5).max(60),
    traits: z.array(srdTraitSchema).min(1).max(10),
  })
  .strict();
export type SrdSpecies = z.infer<typeof srdSpeciesSchema>;

export const SRD_FEAT_CATEGORIES = ['Origin', 'General', 'Fighting Style', 'Epic Boon'] as const;
export type SrdFeatCategory = (typeof SRD_FEAT_CATEGORIES)[number];

export const srdFeatSchema = z
  .object({
    featId: srdIdSchema,
    name: words(60),
    category: z.enum(SRD_FEAT_CATEGORIES),
    /** "Level 4+, Strength or Dexterity 13+"; null for none. */
    prerequisite: words(200).nullable(),
    /** It can be taken more than once ("Repeatable."). */
    repeatable: z.boolean(),
    blocks: z.array(srdBlockSchema).min(1).max(20),
  })
  .strict();
export type SrdFeat = z.infer<typeof srdFeatSchema>;
