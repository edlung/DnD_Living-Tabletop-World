import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * Reaction commands (docs/adr/0016-reaction-engine.md). A reaction window
 * suspends a spell until every candidate answers or the DM closes it.
 * Schemas validate shape only; the Rules decide legality.
 */
export const REACTION_IDS = ['counterspell'] as const;
export type ReactionId = (typeof REACTION_IDS)[number];

export const SPELL_COMPONENTS = ['V', 'S', 'M'] as const;
export type SpellComponent = (typeof SPELL_COMPONENTS)[number];

/** How a candidate answered: `expired` when the window closed before it answered. */
export const REACTION_RESPONSES = ['pending', 'used', 'declined', 'expired'] as const;
export type ReactionResponse = (typeof REACTION_RESPONSES)[number];

export const REACTION_WINDOW_STATUSES = ['open', 'countered', 'proceeded'] as const;
export type ReactionWindowStatus = (typeof REACTION_WINDOW_STATUSES)[number];

export const useReactionCommandSchema = z
  .object({
    type: z.literal('UseReaction'),
    combatantId: entityIdSchema,
    windowId: entityIdSchema,
    reaction: z.enum(REACTION_IDS),
    /** Counterspell's slot (level 3+); omitted = the lowest one available. */
    using: z
      .object({ slotLevel: z.number().int().min(1).max(9) })
      .strict()
      .optional(),
  })
  .strict();

/** "Ignore": the candidate lets the spell happen. */
export const declineReactionCommandSchema = z
  .object({
    type: z.literal('DeclineReaction'),
    combatantId: entityIdSchema,
    windowId: entityIdSchema,
  })
  .strict();

/** DM (or system): closes the window; unanswered candidates expire and the spell proceeds. */
export const closeReactionWindowCommandSchema = z
  .object({ type: z.literal('CloseReactionWindow'), windowId: entityIdSchema })
  .strict();

/** Commands that answer or close a window: the only combat commands accepted while one is open. */
export const REACTION_COMMAND_TYPES = [
  'UseReaction',
  'DeclineReaction',
  'CloseReactionWindow',
] as const;
export type ReactionCommandType = (typeof REACTION_COMMAND_TYPES)[number];
