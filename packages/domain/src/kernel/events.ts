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

import {
  characterAssignedPayloadSchema,
  knowledgeAssignedPayloadSchema,
  knowledgeRestoreSchemas,
} from '../knowledge/events.ts';
import {
  memoryRecordedPayloadSchema,
  memoryRestoreSchemas,
  sessionEndedPayloadSchema,
  sessionStartedPayloadSchema,
} from '../memory/events.ts';
import { characterRestoreSchemas, characterSheetSetPayloadSchema } from '../character/character.ts';
import { combatEventPayloadSchemas, combatRestoreSchemas } from '../combat/events.ts';
import { reactionEventPayloadSchemas, reactionRestoreSchemas } from '../combat/reaction-events.ts';
import {
  claimSetPayloadSchema,
  contradictionDetectedPayloadSchema,
  epistemicRestoreSchemas,
} from '../contradiction/events.ts';
import {
  clueAddedPayloadSchema,
  disclosureSetPayloadSchema,
  evidenceExaminedPayloadSchema,
  informationSharedPayloadSchema,
  investigationRestoreSchemas,
  premisesRecordedPayloadSchema,
} from '../investigation/events.ts';
import { actorSchema } from './actor.ts';

/**
 * Events of the campaign stream: World Kernel events
 * (docs/adr/0007-world-kernel-model-and-event-store.md) plus knowledge events
 * (docs/adr/0008-knowledge-boundary.md). `KernelEvent` is the whole union.
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
  ...knowledgeRestoreSchemas,
  ...memoryRestoreSchemas,
  ...characterRestoreSchemas,
  ...investigationRestoreSchemas,
  ...epistemicRestoreSchemas,
  ...combatRestoreSchemas,
  ...reactionRestoreSchemas,
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
        /** Empty when the undone command changed nothing restorable (Gate 02, G02-M01). */
        restores: z.array(restoreSchema),
      })
      .strict(),
  ),
  event('KnowledgeAssigned', knowledgeAssignedPayloadSchema),
  event('CharacterAssigned', characterAssignedPayloadSchema),
  event('MemoryRecorded', memoryRecordedPayloadSchema),
  event('SessionStarted', sessionStartedPayloadSchema),
  event('SessionEnded', sessionEndedPayloadSchema),
  event('CharacterSheetSet', characterSheetSetPayloadSchema),
  event('ClueAdded', clueAddedPayloadSchema),
  event('DisclosureSet', disclosureSetPayloadSchema),
  event('EvidenceExamined', evidenceExaminedPayloadSchema),
  event('InformationShared', informationSharedPayloadSchema),
  event('ClaimSet', claimSetPayloadSchema),
  event('ContradictionDetected', contradictionDetectedPayloadSchema),
  event('PremisesRecorded', premisesRecordedPayloadSchema),
  event('CombatStarted', combatEventPayloadSchemas.CombatStarted),
  event('TurnStarted', combatEventPayloadSchemas.TurnStarted),
  event('CombatantUpdated', combatEventPayloadSchemas.CombatantUpdated),
  event('CombatEnded', combatEventPayloadSchemas.CombatEnded),
  event('StatBlockSet', combatEventPayloadSchemas.StatBlockSet),
  event('AttackPerformed', combatEventPayloadSchemas.AttackPerformed),
  event('SpellCast', combatEventPayloadSchemas.SpellCast),
  event('DamageApplied', combatEventPayloadSchemas.DamageApplied),
  event('HealingApplied', combatEventPayloadSchemas.HealingApplied),
  event('SavingThrowRolled', combatEventPayloadSchemas.SavingThrowRolled),
  event('ConditionApplied', combatEventPayloadSchemas.ConditionApplied),
  event('DeathSaveRolled', combatEventPayloadSchemas.DeathSaveRolled),
  event('ReactionWindowOpened', reactionEventPayloadSchemas.ReactionWindowOpened),
  event('ReactionUsed', reactionEventPayloadSchemas.ReactionUsed),
  event('ReactionDeclined', reactionEventPayloadSchemas.ReactionDeclined),
  event('ReactionWindowExpired', reactionEventPayloadSchemas.ReactionWindowExpired),
  event('ReactionWindowResolved', reactionEventPayloadSchemas.ReactionWindowResolved),
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
