import { actorIdSchema } from '@ltw/contracts';
import { z } from 'zod';

/**
 * Who issued a command. The application layer derives this from
 * authentication; it is never taken from client-supplied data.
 * `system` is reserved for trusted internal processes (seeding, timers);
 * `display` is a table display paired to one campaign (docs/adr/0042-table-display.md):
 * it reads the PUBLIC and PARTY views and issues no command.
 */
export const actorSchema = z
  .object({
    actorId: actorIdSchema,
    kind: z.enum(['user', 'system', 'display']),
  })
  .strict();

export type Actor = z.infer<typeof actorSchema>;
