import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import { CLASS_RESOURCES } from '../rules/class-features.ts';

/**
 * A class feature used (docs/adr/0056-characters-from-the-srd.md §4): a resource spent — Second
 * Wind, Rage, Action Surge, Lay on Hands, Bardic Inspiration… — in a fight with its turn's action
 * or Bonus Action, or out of one; a Rage ended; a Bardic Inspiration die rolled by its holder.
 */
export const FEATURE_ACTS = [
  ...CLASS_RESOURCES,
  'end-rage',
  'inspiration-die',
  /** Leaving Wild Shape's form early, with a Bonus Action (docs/adr/0056-…md §5). */
  'end-wild-shape',
] as const;
export type FeatureAct = (typeof FEATURE_ACTS)[number];

export const useFeatureCommandSchema = z
  .object({
    type: z.literal('UseFeature'),
    characterId: entityIdSchema,
    feature: z.enum(FEATURE_ACTS),
    /** Lay on Hands' or Bardic Inspiration's creature. */
    targetId: entityIdSchema.optional(),
    /** The points spent: Lay on Hands' hit points, Focus or Sorcery Points. */
    amount: z.number().int().min(1).max(100).optional(),
    /** The expended slots Arcane Recovery or Magical Cunning regains, by level. */
    slots: z.array(z.number().int().min(1).max(9)).min(1).max(9).optional(),
    /**
     * The feature's own use where it has several: Lay on Hands' `cure-poison`, a Channel Divinity,
     * Wild Shape's Beast form (an SRD stat block).
     */
    option: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(48)
      .optional(),
  })
  .strict();
export type UseFeatureCommand = z.infer<typeof useFeatureCommandSchema>;

/** A Sorcerer's Metamagic options (SRD 5.2.1; docs/adr/0056-characters-from-the-srd.md §4). */
export const METAMAGIC_OPTIONS = [
  'careful-spell',
  'distant-spell',
  'empowered-spell',
  'extended-spell',
  'heightened-spell',
  'quickened-spell',
  'seeking-spell',
  'subtle-spell',
  'transmuted-spell',
  'twinned-spell',
] as const;
export type MetamagicId = (typeof METAMAGIC_OPTIONS)[number];

/** Transmuted Spell's types: one of them becomes another. */
export const TRANSMUTABLE = ['acid', 'cold', 'fire', 'lightning', 'poison', 'thunder'] as const;

/**
 * The Metamagic a cast spends Sorcery Points on: its options (one, or with Empowered or Seeking
 * beside it), the creatures Careful Spell spares, Heightened Spell's creature, Transmuted Spell's
 * type. Absent creatures are the World Engine's choice: the caster's allies, its first target.
 */
export const metamagicSchema = z
  .object({
    options: z.array(z.enum(METAMAGIC_OPTIONS)).min(1).max(3),
    careful: z.array(entityIdSchema).min(1).max(6).optional(),
    heightened: entityIdSchema.optional(),
    transmuted: z.enum(TRANSMUTABLE).optional(),
  })
  .strict();
export type MetamagicChoice = z.infer<typeof metamagicSchema>;
