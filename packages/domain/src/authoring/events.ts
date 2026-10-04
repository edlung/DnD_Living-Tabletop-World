import { entityIdSchema } from '@ltw/contracts';
import { z } from 'zod';

/**
 * What an authoring commit's legality rested on beyond its operations' own
 * events (docs/adr/0019-continuity-engine.md §2). Reads only: it changes no
 * state, and its footprint keeps undo and re-decision exact. `status`: the
 * holder's status history decided that it could still learn something.
 */
export const authoringPremisesPayloadSchema = z
  .object({
    premises: z
      .array(z.object({ kind: z.literal('status'), entityId: entityIdSchema }).strict())
      .min(1)
      .max(32),
  })
  .strict();
