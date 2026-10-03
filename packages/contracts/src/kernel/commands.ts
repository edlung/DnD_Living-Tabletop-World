import { z } from 'zod';

import { addKnowledgeCommandSchema, assignCharacterCommandSchema } from '../knowledge/commands.ts';
import {
  endSessionCommandSchema,
  recordMemoryCommandSchema,
  startSessionCommandSchema,
} from '../memory/commands.ts';
import { commandIdSchema, entityIdSchema, sceneIdSchema } from './identifiers.ts';
import { worldDurationSchema, worldTimeSchema } from './world-time.ts';

/**
 * World Kernel commands (docs/adr/0007-world-kernel-model-and-event-store.md).
 * Schemas validate shape only; legality is decided by the World Engine.
 * Every object is strict: unknown fields are rejected, never ignored.
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

const name = z.string().trim().min(1).max(120);
const description = z.string().trim().max(4000);

const createCampaign = z
  .object({
    type: z.literal('CreateCampaign'),
    name,
    worldName: name,
    startsAt: worldTimeSchema,
  })
  .strict();

const createEntity = z
  .object({
    type: z.literal('CreateEntity'),
    entityId: entityIdSchema.optional(),
    kind: z.enum(ENTITY_KINDS),
    name,
    description: description.optional(),
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

const placeEntity = z
  .object({ type: z.literal('PlaceEntity'), entityId: entityIdSchema, locationId: entityIdSchema })
  .strict();

const updateEntityProfile = z
  .object({
    type: z.literal('UpdateEntityProfile'),
    entityId: entityIdSchema,
    name: name.optional(),
    description: description.optional(),
  })
  .strict();

const changeEntityStatus = z
  .object({
    type: z.literal('ChangeEntityStatus'),
    entityId: entityIdSchema,
    status: z.enum(ENTITY_STATUSES),
  })
  .strict();

const startScene = z
  .object({
    type: z.literal('StartScene'),
    sceneId: sceneIdSchema.optional(),
    title: z.string().trim().min(1).max(200),
    locationId: entityIdSchema,
  })
  .strict();

const endScene = z.object({ type: z.literal('EndScene'), sceneId: sceneIdSchema }).strict();

/** Exactly one of `by` (duration) or `to` (absolute world time). */
const advanceWorldTime = z
  .object({
    type: z.literal('AdvanceWorldTime'),
    by: worldDurationSchema.optional(),
    to: worldTimeSchema.optional(),
  })
  .strict();

const undoCommand = z
  .object({ type: z.literal('UndoCommand'), targetCommandId: commandIdSchema })
  .strict();

export const kernelCommandSchema = z
  .discriminatedUnion('type', [
    createCampaign,
    createEntity,
    placeEntity,
    updateEntityProfile,
    changeEntityStatus,
    startScene,
    endScene,
    advanceWorldTime,
    undoCommand,
    addKnowledgeCommandSchema,
    recordMemoryCommandSchema,
    startSessionCommandSchema,
    endSessionCommandSchema,
    assignCharacterCommandSchema,
  ])
  .superRefine((command, context) => {
    if (
      command.type === 'AdvanceWorldTime' &&
      (command.by === undefined) === (command.to === undefined)
    ) {
      context.addIssue({ code: 'custom', message: 'provide exactly one of "by" or "to"' });
    }
    if (
      command.type === 'UpdateEntityProfile' &&
      command.name === undefined &&
      command.description === undefined
    ) {
      context.addIssue({ code: 'custom', message: 'provide "name" and/or "description"' });
    }
  });

export type KernelCommand = z.infer<typeof kernelCommandSchema>;
export type KernelCommandType = KernelCommand['type'];
export type KernelCommandOf<T extends KernelCommandType> = Extract<KernelCommand, { type: T }>;

export const KERNEL_COMMAND_TYPES = [
  'CreateCampaign',
  'CreateEntity',
  'PlaceEntity',
  'UpdateEntityProfile',
  'ChangeEntityStatus',
  'StartScene',
  'EndScene',
  'AdvanceWorldTime',
  'UndoCommand',
  'AddKnowledge',
  'AssignCharacter',
  'RecordMemory',
  'StartSession',
  'EndSession',
] as const satisfies readonly KernelCommandType[];

export const kernelCommandTypeSchema = z.enum(KERNEL_COMMAND_TYPES);

/** Compile-time guard: every command in the union is listed above. */
type AssertNever<T extends never> = T;
export type KernelCommandTypesAreExhaustive = AssertNever<
  Exclude<KernelCommandType, (typeof KERNEL_COMMAND_TYPES)[number]>
>;
