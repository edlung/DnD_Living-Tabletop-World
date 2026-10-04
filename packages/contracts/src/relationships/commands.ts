import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * Relationships (docs/adr/0019-continuity-engine.md §3, owner decision): an
 * NPC's attitude toward the party. DM data: no player view shows it. Stage
 * 130 decides how it affects runtime disclosure.
 */
export const ATTITUDES = ['HOSTILE', 'WARY', 'NEUTRAL', 'FRIENDLY', 'TRUSTED'] as const;
export type Attitude = (typeof ATTITUDES)[number];
/** An NPC without a recorded attitude is neutral toward the party. */
export const DEFAULT_ATTITUDE: Attitude = 'NEUTRAL';

/** DM or system only, directly or through a confirmed authoring proposal. */
export const setRelationshipCommandSchema = z
  .object({
    type: z.literal('SetRelationship'),
    npcId: entityIdSchema,
    attitude: z.enum(ATTITUDES),
  })
  .strict();
