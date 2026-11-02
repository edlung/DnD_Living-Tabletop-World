import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * Reaction commands (docs/adr/0016-reaction-engine.md). A reaction window
 * suspends a spell — or a move out of reach (docs/adr/0046-reactions-beyond-counterspell.md) —
 * until every candidate answers or the DM closes it. Schemas validate shape only; the Rules
 * decide legality. The list of reactions only grows, so stored windows stay readable.
 */
export const REACTION_IDS = [
  'counterspell',
  'opportunity-attack',
  /** Not a Reaction: Heroic Inspiration spent to roll a missed attack's d20 again (ADR 0046 §3). */
  'inspiration-reroll',
  'shield',
  'uncanny-dodge',
  'hellish-rebuke',
] as const;
export type ReactionId = (typeof REACTION_IDS)[number];

export const SPELL_COMPONENTS = ['V', 'S', 'M'] as const;
export type SpellComponent = (typeof SPELL_COMPONENTS)[number];

/** How a candidate answered: `expired` when the window closed before it answered. */
export const REACTION_RESPONSES = ['pending', 'used', 'declined', 'expired'] as const;
export type ReactionResponse = (typeof REACTION_RESPONSES)[number];

/**
 * `waiting`: a window held while a window its answer opened is open (an opportunity attack that a
 * rogue's Uncanny Dodge answers in turn); it opens again when that one closes (ADR 0046 §1).
 */
export const REACTION_WINDOW_STATUSES = ['open', 'countered', 'proceeded', 'waiting'] as const;
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
    /** An opportunity attack's melee attack; omitted = the first the creature has (ADR 0046 §2). */
    attackId: z.string().min(1).max(48).optional(),
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
