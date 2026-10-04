import { z } from 'zod';

import { RELEVANCE_LEVELS } from '../context/views.ts';

/**
 * The relevance ranker's structured output (docs/adr/0021-ai-relevance.md):
 * every legal action, by the opaque key it was given, with a relevance
 * level, most relevant first. Keys name nothing in the world.
 */
export const MAX_RANKED_ACTIONS = 64;

export const relevanceOutputSchema = z
  .object({
    ranking: z
      .array(
        z
          .object({
            key: z.string().regex(/^a[1-9][0-9]{0,2}$/),
            relevance: z.enum(RELEVANCE_LEVELS),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_RANKED_ACTIONS),
  })
  .strict();
export type RelevanceOutput = z.infer<typeof relevanceOutputSchema>;
