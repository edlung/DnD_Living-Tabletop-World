import { z } from 'zod';

import { itemCatalogIdSchema } from '../items/schema.ts';
import { characterSheetSchema } from '../rules/character-sheet.ts';
import { statBlockSchema } from '../combat/stat-block.ts';
import { srdIdSchema } from '../srd/catalog.ts';
import {
  ENTITY_KINDS,
  ENTITY_STATUSES,
  LOCATION_TYPES,
  NPC_MANNER_MAX,
  npcMannerSchema,
} from '../kernel/world-commands.ts';
import { worldTimeSchema } from '../kernel/world-time.ts';
import { KNOWLEDGE_TYPES, KNOWLEDGE_RELATION_TYPES } from '../knowledge/commands.ts';
import { languageSchema } from '../language/language.ts';
import { ATTITUDES } from '../relationships/commands.ts';
import { DISCLOSURES } from '../investigation/commands.ts';
import { questDefinitionSchema } from '../quest/definitions.ts';
import { MAX_MAP_PINS, MAX_ROUTE_MILES, TRAVEL_TERRAINS } from '../travel/travel.ts';
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
    /**
     * An NPC's public manner of speech, one line (docs/adr/0020-npc-intelligence.md, amendment
     * 2026-11-14): NPC dialogue gives it to the model as how it talks. Never a secret, a plot fact
     * or the description. NPCs only: the plan refuses it on any other kind (`MANNER_KIND`).
     */
    manner: npcMannerSchema.optional(),
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
    /**
     * A person or creature from the SRD's bestiary by its ID (docs/adr/0058-campaign-content.md
     * §6): the server writes its stat block from the SRD, whatever `statBlock` said.
     */
    monster: srdIdSchema.optional(),
  })
  .strict();
/**
 * Free authored text about how an NPC talks as a package `manner`: trimmed, folded to one line and,
 * when longer than the limit, cut at the last sentence end that fits (else at the last word).
 * Undefined when nothing is left. For campaign tools; the schema still checks the result.
 */
export function toNpcManner(text: string | undefined): string | undefined {
  const line = (text ?? '')
    .replace(/[\p{Cc}\u2028\u2029]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (line.length <= NPC_MANNER_MAX) return line === '' ? undefined : line;
  const head = line.slice(0, NPC_MANNER_MAX);
  const sentence = /^.*[.!?…](?=\s|$)/u.exec(head)?.[0];
  if (sentence !== undefined && sentence.length >= NPC_MANNER_MAX / 4) return sentence.trim();
  const word = head.slice(0, head.lastIndexOf(' ')).replace(/[\s,;:—–-]+$/u, '');
  return word === '' ? head : `${word}…`;
}

/**
 * What a character or NPC carries when the campaign starts (docs/adr/0039-item-possession.md):
 * an `item` entity (no placement) with its starting holder and, optionally, the catalog entry it
 * is an instance of. Items start carried, never worn.
 */
export const campaignPossessionSchema = z
  .object({
    item: campaignKeySchema,
    holder: campaignKeySchema,
    catalog: itemCatalogIdSchema.optional(),
    quantity: z.number().int().min(1).max(99).default(1),
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

/**
 * The world map (docs/adr/0057-encounters-maps-loot.md §10, ADR 0058 notes of 2026-11-17): a place
 * whose approved picture is a map, with the places it shows pinned where the picture shows them, as
 * fractions of its width and height. The compiler turns it into the World Engine's `SetMapPins`.
 */
export const campaignMapSchema = z
  .object({
    region: campaignKeySchema,
    pins: z
      .array(
        z
          .object({
            place: campaignKeySchema,
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_MAP_PINS),
  })
  .strict();
/** A route between two places: its miles, the predominant terrain and whether a good road runs. */
export const campaignRouteSchema = z
  .object({
    from: campaignKeySchema,
    to: campaignKeySchema,
    miles: z.number().int().min(1).max(MAX_ROUTE_MILES),
    terrain: z.enum(TRAVEL_TERRAINS),
    road: z.boolean(),
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
    /** Absent from packages saved before Stage 470: such a revision keeps its bytes and digest. */
    possessions: z.array(campaignPossessionSchema).max(500).exactOptional(),
    /** Absent from packages saved before the world maps of 2026-11-17, as `possessions` is. */
    maps: z.array(campaignMapSchema).max(16).exactOptional(),
    routes: z.array(campaignRouteSchema).max(500).exactOptional(),
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
export type CampaignPossession = z.infer<typeof campaignPossessionSchema>;
export type CampaignMap = z.infer<typeof campaignMapSchema>;
export type CampaignRoute = z.infer<typeof campaignRouteSchema>;
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
