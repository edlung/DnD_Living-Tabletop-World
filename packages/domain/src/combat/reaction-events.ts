import {
  MAX_COMBATANTS,
  REACTION_IDS,
  REACTION_RESPONSES,
  REACTION_WINDOW_STATUSES,
  SPELL_COMPONENTS,
  commandIdSchema,
  entityIdSchema,
  squareSchema,
} from '@ltw/contracts';
import { z } from 'zod';

/**
 * Reaction window payloads and undo restores
 * (docs/adr/0016-reaction-engine.md). The window is canonical state kept by
 * ID; `ReactionWindowOpened` carries the whole record, the other events
 * change it step by step. All are DM data.
 */
const slug = z.string().min(1).max(48);

/** The suspended spell, with everything needed to resolve it later. */
export const reactionTriggerSchema = z
  .object({
    kind: z.literal('spell'),
    casterId: entityIdSchema,
    spellId: slug,
    components: z.array(z.enum(SPELL_COMPONENTS)).min(1).max(3),
    /** What the cast spent when it was suspended. */
    economy: z.enum(['action', 'bonus']),
    using: z
      .union([z.literal('free'), z.object({ slotLevel: z.number().int().min(1).max(9) }).strict()])
      .nullable(),
    targetId: entityIdSchema.nullable(),
    point: squareSchema.nullable(),
  })
  .strict();

export const reactionWindowSchema = z
  .object({
    windowId: entityIdSchema,
    encounterId: entityIdSchema,
    round: z.number().int().min(1),
    status: z.enum(REACTION_WINDOW_STATUSES),
    trigger: reactionTriggerSchema,
    /** Eligible combatants in initiative order, with their answers. */
    candidates: z
      .array(z.object({ entityId: entityIdSchema, response: z.enum(REACTION_RESPONSES) }).strict())
      .min(1)
      .max(MAX_COMBATANTS - 1),
    /** Every other combatant considered, with the Rules' reason it could not react. */
    ineligible: z
      .array(z.object({ entityId: entityIdSchema, reason: slug }).strict())
      .max(MAX_COMBATANTS - 1),
    /** Traceability: the commands that opened and closed the window. */
    openedBy: commandIdSchema,
    closedBy: commandIdSchema.nullable(),
  })
  .strict();

export const reactionEventPayloadSchemas = {
  ReactionWindowOpened: z.object({ window: reactionWindowSchema }).strict(),
  ReactionUsed: z
    .object({
      windowId: entityIdSchema,
      reactorId: entityIdSchema,
      reaction: z.enum(REACTION_IDS),
      slotLevel: z.number().int().min(1).max(9),
    })
    .strict(),
  ReactionDeclined: z.object({ windowId: entityIdSchema, reactorId: entityIdSchema }).strict(),
  ReactionWindowExpired: z
    .object({
      windowId: entityIdSchema,
      expired: z
        .array(entityIdSchema)
        .min(1)
        .max(MAX_COMBATANTS - 1),
    })
    .strict(),
  ReactionWindowResolved: z
    .object({ windowId: entityIdSchema, outcome: z.enum(['countered', 'proceeded']) })
    .strict(),
} as const;

export const reactionRestoreSchemas = [
  z
    .object({
      fact: z.literal('reactionWindow'),
      windowId: entityIdSchema,
      value: reactionWindowSchema.nullable(),
    })
    .strict(),
] as const;
