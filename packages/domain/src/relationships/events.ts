import { ATTITUDES, entityIdSchema } from '@ltw/contracts';
import { z } from 'zod';

/** Relationship events and undo restores (docs/adr/0019-continuity-engine.md §3). */
const attitude = z.enum(ATTITUDES);

export const relationshipChangedPayloadSchema = z
  .object({ npcId: entityIdSchema, from: attitude, to: attitude })
  .strict();

/** The attitude before the undone change; null when none was recorded (neutral). */
export const relationshipRestoreSchemas = [
  z
    .object({ fact: z.literal('relationship'), npcId: entityIdSchema, value: attitude.nullable() })
    .strict(),
] as const;
