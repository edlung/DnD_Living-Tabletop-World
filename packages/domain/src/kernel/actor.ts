import { z } from 'zod';

/**
 * Who issued a command. The application layer derives this from
 * authentication; it is never taken from client-supplied data.
 * `system` is reserved for trusted internal processes (seeding, timers).
 */
export const actorSchema = z
  .object({
    actorId: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/, 'must be 1-128 safe identifier characters'),
    kind: z.enum(['user', 'system']),
  })
  .strict();

export type Actor = z.infer<typeof actorSchema>;
