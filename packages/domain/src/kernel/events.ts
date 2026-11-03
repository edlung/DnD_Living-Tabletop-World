import {
  ENTITY_KINDS,
  ENTITY_STATUSES,
  LOCATION_TYPES,
  campaignIdSchema,
  commandIdSchema,
  entityIdSchema,
  kernelCommandTypeSchema,
  languageSchema,
  sceneIdSchema,
  worldTimeSchema,
} from '@ltw/contracts';
import { z } from 'zod';

import {
  characterAssignedPayloadSchema,
  characterReleasedPayloadSchema,
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
  evidenceShownPayloadSchema,
  informationSharedPayloadSchema,
  insightCheckedPayloadSchema,
  investigationRestoreSchemas,
  recordedPremisesPayloadSchema,
} from '../investigation/events.ts';
import { authoringPremisesPayloadSchema } from '../authoring/events.ts';
import {
  relationshipChangedPayloadSchema,
  relationshipRestoreSchemas,
} from '../relationships/events.ts';
import {
  itemEquippedPayloadSchema,
  itemGrantedPayloadSchema,
  itemRestoreSchemas,
  itemSplitPayloadSchema,
  itemTransferredPayloadSchema,
  itemUnequippedPayloadSchema,
  itemRecoveredPayloadSchema,
  itemUsedPayloadSchema,
  itemStackChangedPayloadSchema,
  itemAttunedPayloadSchema,
  itemChargesRegainedPayloadSchema,
  itemChargesSpentPayloadSchema,
  itemIdentifiedPayloadSchema,
} from '../items/events.ts';
import {
  assetAdoptedPayloadSchema,
  assetApprovedPayloadSchema,
  assetGeneratedPayloadSchema,
  assetJobFailedPayloadSchema,
  assetJobStartedPayloadSchema,
  assetRequestCancelledPayloadSchema,
  assetRequestedPayloadSchema,
  assetRestoreSchemas,
  assetRetractedPayloadSchema,
  battleMapAlignedPayloadSchema,
} from '../assets/events.ts';
import { weatherRestoreSchemas, weatherSetPayloadSchema } from '../weather/weather.ts';
import {
  campaignOptionsRestoreSchemas,
  campaignOptionsSetPayloadSchema,
} from '../campaign/options.ts';
import { deathRestoreSchemas } from '../character/deaths.ts';
import {
  portraitAskedPayloadSchema,
  portraitWishRestoreSchemas,
} from '../assets/portrait-wishes.ts';
import { chronicleGeneratedPayloadSchema, chronicleRestoreSchemas } from '../chronicle/records.ts';
import { merchantRestoreSchemas, merchantSetPayloadSchema } from '../items/trade.ts';
import {
  craftingAbandonedPayloadSchema,
  craftingFinishedPayloadSchema,
  craftingRestoreSchemas,
  craftingStartedPayloadSchema,
  craftingWorkedPayloadSchema,
} from '../items/crafting.ts';
import {
  mapPinsSetPayloadSchema,
  partyTravelledPayloadSchema,
  routeSetPayloadSchema,
  travelRestoreSchemas,
} from '../travel/map.ts';
import {
  questRestoreSchemas,
  questSetPayloadSchema,
  questStepSetPayloadSchema,
} from '../quest/hand-quests.ts';
import {
  preparedPartyEstablishedPayloadSchema,
  campaignBootstrappedPayloadSchema,
} from '../campaign/bootstrap-events.ts';
import { actorSchema } from './actor.ts';
import { decodePayload, isVersioned } from './event-versions.ts';

/**
 * Events of the campaign stream: World Kernel events
 * (docs/adr/0007-world-kernel-model-and-event-store.md) plus knowledge events
 * (docs/adr/0008-knowledge-boundary.md). `KernelEvent` is the whole union.
 * Events are facts: they are validated when loaded from storage and are
 * never edited. Each type is written with its current schema version and
 * every version it was ever written with stays readable (`event-versions.ts`).
 */

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
  ...relationshipRestoreSchemas,
  ...assetRestoreSchemas,
  ...weatherRestoreSchemas,
  ...campaignOptionsRestoreSchemas,
  ...deathRestoreSchemas,
  ...portraitWishRestoreSchemas,
  ...merchantRestoreSchemas,
  ...craftingRestoreSchemas,
  ...travelRestoreSchemas,
  ...questRestoreSchemas,
  ...chronicleRestoreSchemas,
  ...itemRestoreSchemas,
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
        /** Absent in histories written before ADR 0031: they read as English. */
        language: languageSchema.optional(),
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
  event('PremisesRecorded', recordedPremisesPayloadSchema),
  event('CombatStarted', combatEventPayloadSchemas.CombatStarted),
  event('TurnStarted', combatEventPayloadSchemas.TurnStarted),
  event('CombatantUpdated', combatEventPayloadSchemas.CombatantUpdated),
  event('CombatEnded', combatEventPayloadSchemas.CombatEnded),
  event('CombatOrderChanged', combatEventPayloadSchemas.CombatOrderChanged),
  event('LightSet', combatEventPayloadSchemas.LightSet),
  event('TerrainPainted', combatEventPayloadSchemas.TerrainPainted),
  event('FogSet', combatEventPayloadSchemas.FogSet),
  event('TrapChanged', combatEventPayloadSchemas.TrapChanged),
  event('StatBlockSet', combatEventPayloadSchemas.StatBlockSet),
  event('ActionTaken', combatEventPayloadSchemas.ActionTaken),
  event('FeatureUsed', combatEventPayloadSchemas.FeatureUsed),
  event('AttackPerformed', combatEventPayloadSchemas.AttackPerformed),
  event('WeaponMasteryApplied', combatEventPayloadSchemas.WeaponMasteryApplied),
  event('SpellCast', combatEventPayloadSchemas.SpellCast),
  event('DamageApplied', combatEventPayloadSchemas.DamageApplied),
  event('HealingApplied', combatEventPayloadSchemas.HealingApplied),
  event('HitPointsAdjusted', combatEventPayloadSchemas.HitPointsAdjusted),
  event('SavingThrowRolled', combatEventPayloadSchemas.SavingThrowRolled),
  event('CheckRolled', combatEventPayloadSchemas.CheckRolled),
  event('RechargeRolled', combatEventPayloadSchemas.RechargeRolled),
  event('CreatureActionUsed', combatEventPayloadSchemas.CreatureActionUsed),
  event('ConditionApplied', combatEventPayloadSchemas.ConditionApplied),
  event('DeathSaveRolled', combatEventPayloadSchemas.DeathSaveRolled),
  event('ReactionWindowOpened', reactionEventPayloadSchemas.ReactionWindowOpened),
  event('ReactionUsed', reactionEventPayloadSchemas.ReactionUsed),
  event('ReactionDeclined', reactionEventPayloadSchemas.ReactionDeclined),
  event('ReactionWindowExpired', reactionEventPayloadSchemas.ReactionWindowExpired),
  event('ReactionWindowResolved', reactionEventPayloadSchemas.ReactionWindowResolved),
  event('ReactionWindowWaiting', reactionEventPayloadSchemas.ReactionWindowWaiting),
  event('ReactionWindowResumed', reactionEventPayloadSchemas.ReactionWindowResumed),
  event('RelationshipChanged', relationshipChangedPayloadSchema),
  event('AuthoringPremisesRecorded', authoringPremisesPayloadSchema),
  event('EvidenceShown', evidenceShownPayloadSchema),
  event('InsightChecked', insightCheckedPayloadSchema),
  event('PreparedPartyEstablished', preparedPartyEstablishedPayloadSchema),
  event('CampaignBootstrapped', campaignBootstrappedPayloadSchema),
  event('AssetAdopted', assetAdoptedPayloadSchema),
  event('AssetRequested', assetRequestedPayloadSchema),
  event('AssetJobStarted', assetJobStartedPayloadSchema),
  event('AssetGenerated', assetGeneratedPayloadSchema),
  event('AssetJobFailed', assetJobFailedPayloadSchema),
  event('AssetRequestCancelled', assetRequestCancelledPayloadSchema),
  event('AssetRetracted', assetRetractedPayloadSchema),
  event('BattleMapAligned', battleMapAlignedPayloadSchema),
  event('AssetApproved', assetApprovedPayloadSchema),
  event('WeatherSet', weatherSetPayloadSchema),
  event('CampaignOptionsSet', campaignOptionsSetPayloadSchema),
  event('PortraitAsked', portraitAskedPayloadSchema),
  event('MerchantSet', merchantSetPayloadSchema),
  event('ChronicleGenerated', chronicleGeneratedPayloadSchema),
  event('CharacterReleased', characterReleasedPayloadSchema),
  event('ItemGranted', itemGrantedPayloadSchema),
  event('ItemEquipped', itemEquippedPayloadSchema),
  event('ItemUnequipped', itemUnequippedPayloadSchema),
  event('ItemUsed', itemUsedPayloadSchema),
  event('ItemStackChanged', itemStackChangedPayloadSchema),
  event('ItemRecovered', itemRecoveredPayloadSchema),
  event('ItemTransferred', itemTransferredPayloadSchema),
  event('ItemSplit', itemSplitPayloadSchema),
  // Attunement (docs/adr/0054-items-as-data.md §5).
  event('ItemAttuned', itemAttunedPayloadSchema),
  // Charges and what a carrier knows (ADR 0054 §5).
  event('ItemChargesSpent', itemChargesSpentPayloadSchema),
  event('ItemChargesRegained', itemChargesRegainedPayloadSchema),
  event('ItemIdentified', itemIdentifiedPayloadSchema),
  // Crafting (docs/adr/0057-encounters-maps-loot.md §9).
  event('CraftingStarted', craftingStartedPayloadSchema),
  event('CraftingWorked', craftingWorkedPayloadSchema),
  event('CraftingFinished', craftingFinishedPayloadSchema),
  event('CraftingAbandoned', craftingAbandonedPayloadSchema),
  // The world map and travel (§10).
  event('MapPinsSet', mapPinsSetPayloadSchema),
  event('RouteSet', routeSetPayloadSchema),
  event('PartyTravelled', partyTravelledPayloadSchema),
  // Quests by hand (docs/adr/0058-campaign-content.md §2).
  event('QuestSet', questSetPayloadSchema),
  event('QuestStepSet', questStepSetPayloadSchema),
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
    /** The payload's schema version for its type (`event-versions.ts`). */
    schemaVersion: z.number().int().min(1),
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

/**
 * Validates a stored event (for example a database row) before it is folded:
 * its payload against the schema of the version it was written with, decoded
 * into the current in-memory form (`event-versions.ts`).
 */
export function parseRecordedEvent(raw: unknown): RecordedEvent {
  if (raw === null || typeof raw !== 'object') {
    throw new TypeError('recorded event must be an object');
  }
  const { type, payload, ...rest } = raw as Record<string, unknown>;
  const envelope = eventEnvelopeSchema.parse(rest);
  const event = kernelEventSchema.parse({ type, payload });
  const decoded = decodePayload(event.type, envelope.schemaVersion, event.payload);
  if (!isVersioned(event.type)) return { ...envelope, ...event };
  return { ...envelope, ...kernelEventSchema.parse({ type: event.type, payload: decoded }) };
}
