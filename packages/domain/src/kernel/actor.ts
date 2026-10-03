import { actorIdSchema } from '@ltw/contracts';
import { z } from 'zod';

/**
 * Who issued a command. The application layer derives this from
 * authentication; it is never taken from client-supplied data.
 * `system` is reserved for trusted internal processes (seeding, timers).
 */
export const actorSchema = z
  .object({
    actorId: actorIdSchema,
    kind: z.enum(['user', 'system']),
  })
  .strict();

export type Actor = z.infer<typeof actorSchema>;
