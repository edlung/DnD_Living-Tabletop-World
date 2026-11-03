import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import { squareSchema } from './battlefield.ts';

/**
 * The DM's hand on a running fight's board (docs/adr/0057-encounters-maps-loot.md §2): a
 * combatant set down on a free square — no movement spent, no opportunity attack, a rider carried
 * with its mount — by choosing it and its square or by dragging its token.
 */
export const placeCombatantCommandSchema = z
  .object({
    type: z.literal('PlaceCombatant'),
    combatantId: entityIdSchema,
    position: squareSchema,
  })
  .strict();
