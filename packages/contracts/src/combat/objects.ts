import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import { squareSchema } from './commands.ts';
import { OBJECT_MATERIALS, OBJECT_SIZES } from './stat-block.ts';

/**
 * An object the party attacks (docs/adr/0048-hit-points.md §5): the DM brings a thing at the place —
 * a door, a chest, a rope — into the running fight on a square. The World Engine gives it its
 * Armor Class by material and its hit points by size, fragile or resilient (SRD 5.2.1); it takes
 * no turn and rolls no initiative.
 */
export const addObjectCommandSchema = z
  .object({
    type: z.literal('AddObject'),
    entityId: entityIdSchema,
    material: z.enum(OBJECT_MATERIALS),
    size: z.enum(OBJECT_SIZES),
    /** Resilient as a door or a chest, fragile as a bottle or a rope. */
    resilient: z.boolean(),
    position: squareSchema,
  })
  .strict();
