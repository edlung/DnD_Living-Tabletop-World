import {
  CONDITIONS,
  DAY_PHASES,
  ENTITY_KINDS,
  ENTITY_STATUSES,
  KNOWLEDGE_RELATION_TYPES,
  KNOWLEDGE_TYPES,
  WEATHERS,
  EQUIP_SLOTS,
  ITEM_CATEGORIES,
  battlefieldSchema,
  characterSheetSchema,
  itemEffectSchema,
  knowledgeClaimSchema,
  workshopIdSchema,
} from '@ltw/contracts';
import { z } from 'zod';

import { assessmentSchema } from '../response-schemas.ts';

const id = workshopIdSchema;
const reference = z.object({ entityId: id, kind: z.enum(ENTITY_KINDS), name: z.string() }).strict();
const seenReference = reference.extend({ name: z.string().nullable() });
const image = z
  .object({
    variant: z.enum(['reference', 'derived']),
    purpose: z.enum(['image', 'figure', 'battle-map']),
    contentHash: z.string(),
    mediaType: z.enum(['image/svg+xml', 'image/png', 'image/webp']),
  })
  .strict();
const entityPresentation = z
  .object({
    entityId: id,
    kind: z.enum(ENTITY_KINDS),
    observed: z.boolean(),
    status: z.enum(ENTITY_STATUSES).nullable(),
    vitals: z.object({ wounded: z.boolean(), unconscious: z.boolean() }).strict().nullable(),
    conditions: z.array(z.enum(CONDITIONS)),
    equipment: z.array(z.string()),
    weather: z.enum(WEATHERS).nullable(),
    tags: z.array(z.string()),
    image: image.nullable(),
    figure: image.nullable(),
    battleMap: image.nullable(),
  })
  .strict();
const presentation = z
  .object({
    perspective: z.string(),
    worldTime: z.number(),
    phase: z.enum(DAY_PHASES),
    presentation: entityPresentation,
  })
  .strict();
const scene = z
  .object({
    perspective: z.string(),
    worldTime: z.number(),
    phase: z.enum(DAY_PHASES),
    location: entityPresentation,
    present: z.array(entityPresentation),
  })
  .strict();
const scope = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('WORLD_TRUTH') }).strict(),
  z.object({ kind: z.literal('DM') }).strict(),
  z.object({ kind: z.literal('PUBLIC') }).strict(),
  z.object({ kind: z.literal('PARTY') }).strict(),
  z.object({ kind: z.literal('CHARACTER'), characterId: id }).strict(),
  z.object({ kind: z.literal('NPC'), npcId: id }).strict(),
]);
const knowledge = z
  .object({
    knowledgeId: id,
    knowledgeType: z.enum(KNOWLEDGE_TYPES),
    scope,
    statement: z.string(),
    subjects: z.array(reference),
    attributedTo: reference.nullable(),
    relations: z.array(
      z.object({ type: z.enum(KNOWLEDGE_RELATION_TYPES), knowledgeId: id }).strict(),
    ),
    knownSince: z.number().nullable(),
  })
  .strict();
const ownerKnowledge = knowledge
  .extend({
    origin: z
      .object({
        sequence: z.number(),
        commandId: z.string(),
        actorId: z.string(),
        recordedAt: z.string(),
        worldTime: z.number(),
      })
      .strict()
      .optional(),
    claim: knowledgeClaimSchema.optional(),
  })
  .transform(({ origin, claim, ...value }) => ({
    ...value,
    ...(origin === undefined ? {} : { origin }),
    ...(claim === undefined ? {} : { claim }),
  }));
const owner = z.object({ kind: z.literal('OWNER') }).strict();
const character = z.object({ kind: z.literal('CHARACTER'), character: reference }).strict();
const common = z.object({
  revision: z.number().int().min(1),
  language: z.enum(['ru', 'en']),
  campaignName: z.string(),
  worldName: z.string(),
  manifestDigest: z.string(),
  directory: z.array(seenReference),
  locations: z.array(seenReference),
  scene: scene.nullable(),
});
const combatant = z
  .object({
    entity: seenReference,
    side: z.enum(['party', 'hostile', 'neutral']),
    position: z.object({ x: z.number(), y: z.number() }).strict(),
    state: z.enum(['up', 'down', 'dead']),
    conditions: z.array(z.enum(CONDITIONS)),
    hitPoints: z.object({ current: z.number(), max: z.number() }).strict().optional(),
  })
  .strict()
  .transform(({ hitPoints, ...value }) => ({
    ...value,
    ...(hitPoints === undefined ? {} : { hitPoints }),
  }));
export const previewViewSchema = z.union([
  common
    .extend({
      perspective: owner,
      assessment: assessmentSchema,
      prepared: z
        .object({
          encounterId: id,
          title: z.string(),
          layout: z
            .object({ battlefield: battlefieldSchema, combatants: z.array(combatant) })
            .strict(),
        })
        .strict()
        .nullable(),
    })
    .strict(),
  common.extend({ perspective: character }).strict(),
]);
export const previewCatalogSchema = z
  .object({
    revision: z.number().int().min(1),
    language: z.enum(['ru', 'en']),
    campaignName: z.string(),
    worldName: z.string(),
    characters: z.array(reference),
    encounters: z.array(z.object({ encounterId: id, title: z.string(), locationId: id }).strict()),
  })
  .strict();
const entity = z.object({ revision: z.number().int().min(1), entity: seenReference, presentation });
export const previewEntitySchema = z.union([
  entity
    .extend({
      perspective: owner,
      knowledge: z.array(ownerKnowledge),
      ownerDescription: z.string().optional(),
    })
    .strict()
    .transform(({ ownerDescription, ...value }) => ({
      ...value,
      ...(ownerDescription === undefined ? {} : { ownerDescription }),
    })),
  entity.extend({ perspective: character, knowledge: z.array(knowledge) }).strict(),
]);
export const previewSheetSchema = z
  .object({
    revision: z.number().int().min(1),
    perspective: z.string(),
    entity: reference,
    sheet: characterSheetSchema,
  })
  .strict();
const inventoryItem = z
  .object({
    itemId: id,
    name: z.string(),
    description: z.string(),
    quantity: z.number().int().min(1),
    slot: z.enum(EQUIP_SLOTS).nullable(),
    catalog: z
      .object({
        itemId: z.string(),
        category: z.enum(ITEM_CATEGORIES),
        name: z.object({ ru: z.string(), en: z.string() }).strict(),
        description: z.object({ ru: z.string(), en: z.string() }).strict(),
        weightLb: z.number(),
        slots: z.array(z.enum(EQUIP_SLOTS)),
        effect: itemEffectSchema.nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const previewInventorySchema = z
  .object({
    revision: z.number().int().min(1),
    perspective: z.string(),
    entity: reference,
    items: z.array(inventoryItem),
    totalWeightLb: z.number(),
  })
  .strict();
