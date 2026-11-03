import { z } from 'zod';

import { srdIdSchema } from './catalog.ts';
import { srdBlockSchema } from './reference.ts';

/**
 * The SRD's twelve classes as it gives them (docs/adr/0056-characters-from-the-srd.md §1): core
 * traits in their words, what a second class gives, the features table (level, proficiency bonus,
 * features, the class's own columns as written), the features by level in blocks, its sidebars,
 * the options its features choose among, and the subclass with its features. English, read only;
 * the rules derive what a character gains from it.
 */
const words = (max: number) => z.string().min(1).max(max);

export const srdClassFeatureSchema = z
  .object({
    level: z.number().int().min(1).max(20),
    name: words(80),
    blocks: z.array(srdBlockSchema).max(80),
  })
  .strict();
export type SrdClassFeature = z.infer<typeof srdClassFeatureSchema>;

/** One of the options a feature chooses among: a Metamagic option, an Eldritch Invocation. */
export const srdClassOptionSchema = z
  .object({
    optionId: srdIdSchema,
    name: words(60),
    /** "Level 5+ Warlock, Pact of the Blade Invocation"; null for none. */
    prerequisite: words(200).nullable(),
    /** "1 Sorcery Point"; null for none. */
    cost: words(60).nullable(),
    /** It can be taken more than once ("Repeatable."). */
    repeatable: z.boolean(),
    blocks: z.array(srdBlockSchema).min(1).max(20),
  })
  .strict();
export type SrdClassOption = z.infer<typeof srdClassOptionSchema>;

const sectionSchema = z
  .object({ title: words(80), blocks: z.array(srdBlockSchema).min(1).max(20) })
  .strict();

export const srdClassSchema = z
  .object({
    classId: srdIdSchema,
    name: words(40),
    /** "Primary Ability", "Hit Point Die", "Saving Throw", "Skill Proficiencies", … as written. */
    core: z.record(words(40), z.string().max(400)),
    /** What a character taking it as another class gains ("As a Multiclass Character"). */
    multiclass: z.array(srdBlockSchema).min(1).max(6),
    /** The features table's own columns after Level, Proficiency Bonus and Class Features. */
    columns: z.array(words(40)).max(14),
    levels: z
      .array(
        z
          .object({
            level: z.number().int().min(1).max(20),
            proficiencyBonus: z.number().int().min(2).max(6),
            features: z.array(words(80)).max(8),
            /** The class's own columns' values as written: "2", "+2", "1d6", "+10 ft.", "—". */
            values: z.array(words(12)).max(14),
          })
          .strict(),
      )
      .length(20),
    features: z.array(srdClassFeatureSchema).max(40),
    /** Its sidebars beside the features ("Breaking Your Oath"). */
    sidebars: z.array(sectionSchema).max(4),
    /** The options its features choose among ("Metamagic Options"); null for none. */
    options: z
      .object({
        title: words(60),
        intro: z.array(srdBlockSchema).max(6),
        entries: z.array(srdClassOptionSchema).min(1).max(40),
      })
      .strict()
      .nullable(),
    subclass: z
      .object({
        name: words(60),
        /** Its line under the name ("Channel Rage into Violent Fury"). */
        tagline: words(120).nullable(),
        intro: z.array(srdBlockSchema).max(10),
        features: z.array(srdClassFeatureSchema).min(1).max(12),
      })
      .strict(),
  })
  .strict();
export type SrdClass = z.infer<typeof srdClassSchema>;
