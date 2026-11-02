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
const spellTriggerSchema = z
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

/**
 * A creature leaving reach (docs/adr/0046-reactions-beyond-counterspell.md §2): it stands on the
 * last square inside the reach it is leaving, and the rest of its path waits for the window.
 */
const moveTriggerSchema = z
  .object({
    kind: z.literal('move'),
    moverId: entityIdSchema,
    at: squareSchema,
    rest: z.array(squareSchema).min(1).max(40),
  })
  .strict();

const damageDice = z
  .object({
    count: z.number().int().min(0).max(20),
    sides: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
    bonus: z.number().int().min(-10).max(30),
    type: slug,
  })
  .strict();

/**
 * An attack roll waiting for an answer (ADR 0046 §3): what it was made with, the roll, and —
 * once it hit — its damage, rolled before anyone answers. A missed roll its attacker may roll
 * again with Heroic Inspiration; a hit its target may answer with Shield or Uncanny Dodge.
 */
const attackTriggerSchema = z
  .object({
    kind: z.literal('attack'),
    attackerId: entityIdSchema,
    targetId: entityIdSchema,
    attackId: slug,
    by: z.enum(['opportunity', 'readied']).optional(),
    phase: z.enum(['missed', 'hit']),
    spec: z
      .object({
        bonus: z.number().int().min(-40).max(40),
        armorClass: z.number().int().min(0).max(60),
        advantage: z.boolean(),
        disadvantage: z.boolean(),
        criticalOnHit: z.boolean(),
        cover: z.enum(['none', 'half', 'three-quarters']),
        damage: damageDice,
        advantageDamage: damageDice.nullable(),
        huntersMark: z.boolean(),
        slow: z.boolean(),
      })
      .strict(),
    /** The d20 that counted, the total and whether it hit. */
    natural: z.number().int().min(1).max(20),
    total: z.number().int(),
    critical: z.boolean(),
    damage: z
      .object({
        amount: z.number().int().min(0).max(999),
        rolls: z.array(z.number().int()).max(60),
      })
      .strict()
      .nullable(),
  })
  .strict();

/** Damage done by a creature (ADR 0046 §4): those it damaged may rebuke it. */
const damageTriggerSchema = z
  .object({
    kind: z.literal('damage'),
    sourceId: entityIdSchema,
    damaged: z
      .array(
        z.object({ entityId: entityIdSchema, amount: z.number().int().min(0).max(999) }).strict(),
      )
      .min(1)
      .max(MAX_COMBATANTS),
  })
  .strict();

export const reactionTriggerSchema = z.discriminatedUnion('kind', [
  spellTriggerSchema,
  moveTriggerSchema,
  attackTriggerSchema,
  damageTriggerSchema,
]);

export const reactionWindowSchema = z
  .object({
    windowId: entityIdSchema,
    encounterId: entityIdSchema,
    round: z.number().int().min(1),
    status: z.enum(REACTION_WINDOW_STATUSES),
    trigger: reactionTriggerSchema,
    /**
     * Eligible combatants in initiative order, with their answers and the reactions each may use
     * here (ADR 0046 §1); a window from before lists none and means Counterspell.
     */
    candidates: z
      .array(
        z
          .object({
            entityId: entityIdSchema,
            response: z.enum(REACTION_RESPONSES),
            reactions: z.array(z.enum(REACTION_IDS)).min(1).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_COMBATANTS - 1),
    /** Every other combatant considered, with the Rules' reason it could not react. */
    ineligible: z
      .array(z.object({ entityId: entityIdSchema, reason: slug }).strict())
      .max(MAX_COMBATANTS - 1),
    /** Traceability: the commands that opened and closed the window. */
    openedBy: commandIdSchema,
    closedBy: commandIdSchema.nullable(),
    /** The window that waits while this one is open (ADR 0046 §1); absent: none. */
    parentWindowId: entityIdSchema.optional(),
  })
  .strict();

export const reactionEventPayloadSchemas = {
  ReactionWindowOpened: z.object({ window: reactionWindowSchema }).strict(),
  ReactionUsed: z
    .object({
      windowId: entityIdSchema,
      reactorId: entityIdSchema,
      reaction: z.enum(REACTION_IDS),
      /** A spell's slot (Counterspell); absent for a reaction that spends none. */
      slotLevel: z.number().int().min(1).max(9).optional(),
      /** An opportunity attack's attack. */
      attackId: slug.optional(),
    })
    .strict(),
  ReactionDeclined: z
    .object({
      windowId: entityIdSchema,
      reactorId: entityIdSchema,
      /** What the window was about (ADR 0046); absent on windows of before: a spell. */
      trigger: z.enum(['spell', 'move', 'attack', 'damage']).optional(),
    })
    .strict(),
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
  /** The window waits while one its answer opened is open (ADR 0046 §1). */
  ReactionWindowWaiting: z.object({ windowId: entityIdSchema }).strict(),
  /** It opens again once that one has closed. */
  ReactionWindowResumed: z.object({ windowId: entityIdSchema }).strict(),
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
