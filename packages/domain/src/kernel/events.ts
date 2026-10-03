import {
  ENTITY_KINDS,
  ENTITY_STATUSES,
  LOCATION_TYPES,
  campaignIdSchema,
  commandIdSchema,
  entityIdSchema,
  kernelCommandTypeSchema,
  sceneIdSchema,
  worldTimeSchema,
} from '@ltw/contracts';
import { z } from 'zod';

import { actorSchema } from './actor.ts';

/**
 * World Kernel events (docs/adr/0007-world-kernel-model-and-event-store.md).
 * Events are facts: they are validated when loaded from storage and are
 * never edited. Payload changes require a new schemaVersion and upcasting.
 */
export const EVENT_SCHEMA_VERSION = 1;

const text = z.string().max(4000);
const status = z.enum(ENTITY_STATUSES);
const placement = z
  .object({ locationId: entityIdSchema, since: worldTimeSchema.nullable() })
  .strict();
const change = <T extends z.ZodType>(value: T) => z.object({ from: value, to: value }).strict();

const event = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.object({ type: z.literal(type), payload }).strict();

/** One restored fact of a compensated command (ADR 0006 §8). */
export const restoreSchema = z.discriminatedUnion('fact', [
  z.object({ fact: z.literal('entity'), entityId: entityIdSchema, value: z.null() }).strict(),
  z
    .object({
      fact: z.literal('entity.profile'),
      entityId: entityIdSchema,
      value: z.object({ name: text, description: text }).strict(),
    })
    .strict(),
  z
    .object({
      fact: z.literal('entity.placement'),
      entityId: entityIdSchema,
      value: placement.nullable(),
    })
    .strict(),
  z.object({ fact: z.literal('entity.status'), entityId: entityIdSchema, value: status }).strict(),
  z.object({ fact: z.literal('scene'), sceneId: sceneIdSchema, value: z.null() }).strict(),
  z
    .object({
      fact: z.literal('scene.ended'),
      sceneId: sceneIdSchema,
      value: worldTimeSchema.nullable(),
    })
    .strict(),
  z.object({ fact: z.literal('world.clock'), value: worldTimeSchema }).strict(),
  z.object({ fact: z.literal('world.activeScene'), value: sceneIdSchema.nullable() }).strict(),
]);
export type Restore = z.infer<typeof restoreSchema>;

export const kernelEventSchema = z.discriminatedUnion('type', [
  event(
    'CampaignCreated',
    z
      .object({
        campaignId: campaignIdSchema,
        name: text,
        worldName: text,
        startsAt: worldTimeSchema,
        dmActorId: actorSchema.shape.actorId,
      })
      .strict(),
  ),
  event(
    'EntityCreated',
    z
      .object({
        entityId: entityIdSchema,
        kind: z.enum(ENTITY_KINDS),
        name: text,
        description: text,
        existsSince: worldTimeSchema.nullable(),
        location: z
          .object({ type: z.enum(LOCATION_TYPES), parentId: entityIdSchema.nullable() })
          .strict()
          .nullable(),
      })
      .strict(),
  ),
  event(
    'EntityPlaced',
    z
      .object({
        entityId: entityIdSchema,
        locationId: entityIdSchema,
        since: worldTimeSchema.nullable(),
        previousLocationId: entityIdSchema.nullable(),
      })
      .strict(),
  ),
  event(
    'EntityProfileUpdated',
    z
      .object({
        entityId: entityIdSchema,
        name: change(text).optional(),
        description: change(text).optional(),
      })
      .strict(),
  ),
  event(
    'EntityStatusChanged',
    z.object({ entityId: entityIdSchema, from: status, to: status }).strict(),
  ),
  event(
    'SceneStarted',
    z.object({ sceneId: sceneIdSchema, title: text, locationId: entityIdSchema }).strict(),
  ),
  event('SceneEnded', z.object({ sceneId: sceneIdSchema }).strict()),
  event('WorldTimeAdvanced', z.object({ from: worldTimeSchema, to: worldTimeSchema }).strict()),
  event(
    'CommandUndone',
    z
      .object({
        targetCommandId: commandIdSchema,
        targetCommandType: kernelCommandTypeSchema,
        restores: z.array(restoreSchema).min(1),
      })
      .strict(),
  ),
]);

export type KernelEvent = z.infer<typeof kernelEventSchema>;
export type KernelEventType = KernelEvent['type'];
export type KernelEventOf<T extends KernelEventType> = Extract<KernelEvent, { type: T }>;

/** Metadata the World Engine stamps on every accepted event. */
export const eventEnvelopeSchema = z
  .object({
    campaignId: campaignIdSchema,
    /** Position in the campaign stream: 1, 2, 3, … without gaps. */
    sequence: z.number().int().min(1),
    eventId: z.uuid(),
    schemaVersion: z.literal(EVENT_SCHEMA_VERSION),
    /** World clock after the event (fictional time). */
    worldTime: worldTimeSchema,
    /** Wall-clock persistence time; informational, never used for ordering. */
    recordedAt: z.iso.datetime(),
    causation: z
      .object({
        commandId: commandIdSchema,
        commandType: kernelCommandTypeSchema,
        actor: actorSchema,
      })
      .strict(),
  })
  .strict();

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
export type RecordedEvent = KernelEvent & EventEnvelope;

/** Validates a stored event (for example a database row) before it is folded. */
export function parseRecordedEvent(raw: unknown): RecordedEvent {
  if (raw === null || typeof raw !== 'object') {
    throw new TypeError('recorded event must be an object');
  }
  const { type, payload, ...envelope } = raw as Record<string, unknown>;
  return { ...eventEnvelopeSchema.parse(envelope), ...kernelEventSchema.parse({ type, payload }) };
}
