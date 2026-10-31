import { z } from 'zod';

import { characterSheetSchema } from '../rules/character-sheet.ts';
import { statBlockSchema } from '../combat/stat-block.ts';
import { ENTITY_KINDS, ENTITY_STATUSES, LOCATION_TYPES } from '../kernel/world-commands.ts';
import { worldTimeSchema } from '../kernel/world-time.ts';
import { KNOWLEDGE_TYPES, KNOWLEDGE_RELATION_TYPES } from '../knowledge/commands.ts';
import { languageSchema } from '../language/language.ts';
import { ATTITUDES } from '../relationships/commands.ts';
import { DISCLOSURES } from '../investigation/commands.ts';
import { questDefinitionSchema } from '../quest/definitions.ts';
import { WEATHERS } from '../visual/commands.ts';
import {
  campaignClueSchema,
  campaignConflictSchema,
  campaignEncounterSchema,
  campaignKeySchema,
  campaignSituationSchema,
  campaignVisualBriefSchema,
} from './story.ts';

export const CAMPAIGN_PACKAGE_VERSION = 1;
const text = z.string().trim().max(4000);
const title = z.string().trim().min(1).max(120);
export const campaignBriefSchema = z
  .object({
    intent: z.string().trim().min(1).max(8000),
    setting: text,
    tone: text,
    duration: text,
    partySize: z.number().int().min(1).max(16),
    partyLevel: z.number().int().min(1).max(20),
    include: z.array(text).max(32),
    exclude: z.array(text).max(32),
  })
  .strict();
export const campaignEntitySchema = z
  .object({
    key: campaignKeySchema,
    kind: z.enum(ENTITY_KINDS),
    name: title,
    description: text,
    status: z.enum(ENTITY_STATUSES),
    existsSince: worldTimeSchema.nullable(),
    location: z
      .object({ type: z.enum(LOCATION_TYPES), parent: campaignKeySchema.nullable() })
      .strict()
      .optional(),
    placement: z
      .object({ location: campaignKeySchema, since: worldTimeSchema.nullable() })
      .strict()
      .optional(),
    sheet: characterSheetSchema.optional(),
    statBlock: statBlockSchema.optional(),
  })
  .strict();
export const campaignKnowledgeScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('WORLD_TRUTH') }).strict(),
  z.object({ kind: z.literal('DM') }).strict(),
  z.object({ kind: z.literal('PUBLIC') }).strict(),
  z.object({ kind: z.literal('PARTY') }).strict(),
  z.object({ kind: z.literal('CHARACTER'), holder: campaignKeySchema }).strict(),
  z.object({ kind: z.literal('NPC'), holder: campaignKeySchema }).strict(),
]);
export const campaignKnowledgeSchema = z
  .object({
    key: campaignKeySchema,
    scope: campaignKnowledgeScopeSchema,
    knowledgeType: z.enum(KNOWLEDGE_TYPES),
    statement: z.string().trim().min(1).max(2000),
    subjects: z.array(campaignKeySchema).max(16),
    attributedTo: campaignKeySchema.optional(),
    knownSince: worldTimeSchema.nullable(),
    relations: z
      .array(
        z.object({ type: z.enum(KNOWLEDGE_RELATION_TYPES), knowledge: campaignKeySchema }).strict(),
      )
      .max(16),
    disclosure: z.enum(DISCLOSURES).optional(),
  })
  .strict();

/** Strict content only: owner identity, canonical IDs, digests and provenance are server data. */
export const campaignPackageSchema = z
  .object({
    schemaVersion: z.literal(CAMPAIGN_PACKAGE_VERSION),
    brief: campaignBriefSchema,
    world: z
      .object({
        name: title,
        worldName: title,
        language: languageSchema,
        startsAt: worldTimeSchema,
        startLocation: campaignKeySchema.nullable(),
        weather: z.enum(WEATHERS),
        opening: text,
      })
      .strict(),
    entities: z.array(campaignEntitySchema).max(500),
    /** Prepared character seats; live controllers are assigned only by real invitations. */
    party: z.array(campaignKeySchema).max(16),
    knowledge: z.array(campaignKnowledgeSchema).max(1000),
    relationships: z
      .array(z.object({ npc: campaignKeySchema, attitude: z.enum(ATTITUDES) }).strict())
      .max(500),
    clues: z.array(campaignClueSchema).max(500),
    conflicts: z.array(campaignConflictSchema).max(100),
    situations: z.array(campaignSituationSchema).max(200),
    encounters: z.array(campaignEncounterSchema).max(100),
    /** Entity-reference fields contain local keys until compilation rewrites every reference. */
    quests: z.array(questDefinitionSchema).max(50),
    visuals: z.array(campaignVisualBriefSchema).max(1000),
    firstSession: z.array(text).max(100),
    laterOutline: z.array(text).max(100),
  })
  .strict();
export type CampaignPackage = z.infer<typeof campaignPackageSchema>;
export type CampaignEntity = z.infer<typeof campaignEntitySchema>;
export type CampaignKnowledge = z.infer<typeof campaignKnowledgeSchema>;
export type CampaignScope = z.infer<typeof campaignKnowledgeScopeSchema>;

export interface CampaignIdentities {
  readonly entities: Readonly<Record<string, string>>;
  readonly knowledge: Readonly<Record<string, string>>;
  readonly clues: Readonly<Record<string, string>>;
  readonly encounters: Readonly<Record<string, string>>;
  readonly scene: string;
  /**
   * Opaque public IDs of quests and of each quest's stages (Gate 07, G07-03): an authored quest
   * key or stage slug states a plot point, and quest logs reach players. Absent from revisions
   * saved before them; such a revision cannot be activated until it is saved again.
   */
  readonly quests?: Readonly<Record<string, string>>;
  readonly stages?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}
/** The public forms of those quest and stage IDs; both are valid quest slugs. */
export const OPAQUE_QUEST_ID = /^q-[0-9a-f]{32}$/;
export const OPAQUE_STAGE_ID = /^s-[0-9a-f]{32}$/;
/** Quest and stage identities as a stored revision holds them, when it holds them. */
export const campaignQuestIdentitiesShape = {
  quests: z.record(campaignKeySchema, z.string().regex(OPAQUE_QUEST_ID)).exactOptional(),
  stages: z
    .record(campaignKeySchema, z.record(campaignKeySchema, z.string().regex(OPAQUE_STAGE_ID)))
    .exactOptional(),
};
export interface CampaignFinding {
  readonly severity: 'error' | 'warning' | 'info';
  readonly code: string;
  readonly path: string;
  readonly message: string;
}
export interface CampaignAssessment {
  readonly compilerVersion: 1;
  readonly readiness: 'INCOMPLETE' | 'INVALID' | 'READY';
  readonly findings: readonly CampaignFinding[];
  readonly counts: {
    readonly entities: number;
    readonly knowledge: number;
    readonly encounters: number;
    readonly quests: number;
  };
}
