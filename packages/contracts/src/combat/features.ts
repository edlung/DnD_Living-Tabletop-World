import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import { CLASS_RESOURCES } from '../rules/class-features.ts';

/**
 * A class feature used (docs/adr/0056-characters-from-the-srd.md §4): a resource spent — Second
 * Wind, Rage, Action Surge, Lay on Hands, Bardic Inspiration… — in a fight with its turn's action
 * or Bonus Action, or out of one; a Rage ended; a Bardic Inspiration die rolled by its holder.
 */
export const FEATURE_ACTS = [...CLASS_RESOURCES, 'end-rage', 'inspiration-die'] as const;
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
    /** The feature's own use where it has several: Lay on Hands' `cure-poison`, a Channel Divinity. */
    option: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(48)
      .optional(),
  })
  .strict();
export type UseFeatureCommand = z.infer<typeof useFeatureCommandSchema>;
