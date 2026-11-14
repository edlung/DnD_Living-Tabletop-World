import { z } from 'zod';

import { entityIdSchema } from './identifiers.ts';
import { worldDurationSchema, worldTimeSchema } from './world-time.ts';

/**
 * World entity and clock commands (docs/adr/0007-world-kernel-model-and-event-store.md).
 * Kept apart from the command union so that authoring contracts can build on
 * them without an import cycle (docs/adr/0018-ai-authoring.md).
 */
export const ENTITY_KINDS = [
  'location',
  'character',
  'npc',
  'creature',
  'item',
  'feature',
  'faction',
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const LOCATION_TYPES = [
  'region',
  'settlement',
  'district',
  'site',
  'building',
  'room',
  'route',
] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const ENTITY_STATUSES = ['active', 'dead', 'destroyed'] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];

/** A display name: never identity (ADR 0006 §4). */
export const entityNameSchema = z.string().trim().min(1).max(120);
const description = z.string().trim().max(4000);

/**
 * An NPC's public manner of speech (docs/adr/0020-npc-intelligence.md, amendment 2026-11-14): one
 * short line of plain text on how it talks, which NPC dialogue gives the model. Public: it never
 * holds a secret or a plot fact. NPCs only (the World Engine and the campaign plan check the kind).
 */
export const NPC_MANNER_MAX = 200;
export const npcMannerSchema = z
  .string()
  .trim()
  .min(1)
  .max(NPC_MANNER_MAX)
  // One line of plain text: no control characters, no line or paragraph separators.
  .refine((manner) => !/[\p{Cc}\u2028\u2029]/u.test(manner), 'must be one line of plain text');

export const createEntityCommandSchema = z
  .object({
    type: z.literal('CreateEntity'),
    entityId: entityIdSchema.optional(),
    kind: z.enum(ENTITY_KINDS),
    name: entityNameSchema,
    description: description.optional(),
    /** An NPC's public manner of speech (ADR 0020 amendment 2026-11-14); NPCs only. */
    manner: npcMannerSchema.optional(),
    /** World time the entity began to exist; `null` = before recorded history. */
    existsSince: worldTimeSchema.nullable(),
    /** Required exactly when `kind` is `location`. */
    location: z
      .object({ type: z.enum(LOCATION_TYPES), parentId: entityIdSchema.nullable() })
      .strict()
      .optional(),
    /** Initial placement; `since` may be backdated within the entity's existence. */
    placement: z
      .object({ locationId: entityIdSchema, since: worldTimeSchema.nullable() })
      .strict()
      .optional(),
  })
  .strict();

export const placeEntityCommandSchema = z
  .object({ type: z.literal('PlaceEntity'), entityId: entityIdSchema, locationId: entityIdSchema })
  .strict();

export const updateEntityProfileCommandSchema = z
  .object({
    type: z.literal('UpdateEntityProfile'),
    entityId: entityIdSchema,
    name: entityNameSchema.optional(),
    description: description.optional(),
    /** An NPC's manner of speech; `''` clears it. NPCs only. */
    manner: npcMannerSchema.or(z.literal('')).optional(),
  })
  .strict();

export const changeEntityStatusCommandSchema = z
  .object({
    type: z.literal('ChangeEntityStatus'),
    entityId: entityIdSchema,
    status: z.enum(ENTITY_STATUSES),
  })
  .strict();

/** Exactly one of `by` (duration) or `to` (absolute world time). */
export const advanceWorldTimeCommandSchema = z
  .object({
    type: z.literal('AdvanceWorldTime'),
    by: worldDurationSchema.optional(),
    to: worldTimeSchema.optional(),
  })
  .strict();

/**
 * Cross-field rules the object schemas cannot express. Every union that
 * holds these commands applies them, so each one reads the same way.
 */
export function worldCommandIssue(command: {
  readonly type: string;
  readonly by?: unknown;
  readonly to?: unknown;
  readonly name?: unknown;
  readonly description?: unknown;
  readonly manner?: unknown;
}): string | null {
  if (
    command.type === 'AdvanceWorldTime' &&
    (command.by === undefined) === (command.to === undefined)
  ) {
    return 'provide exactly one of "by" or "to"';
  }
  if (
    command.type === 'UpdateEntityProfile' &&
    command.name === undefined &&
    command.description === undefined &&
    command.manner === undefined
  ) {
    return 'provide "name", "description" and/or "manner"';
  }
  return null;
}
