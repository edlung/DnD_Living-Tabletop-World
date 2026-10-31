import { z } from 'zod';

import { campaignEntitySchema, campaignPackageSchema } from './package.ts';

/** Ordered preparation steps; an output owns only the fields declared by that step. */
export const CAMPAIGN_GENERATION_STAGES = [
  'concept',
  'topology',
  'cast',
  'knowledge',
  'encounters',
  'first-session',
  'outline',
] as const;
export const campaignGenerationStageSchema = z.enum(CAMPAIGN_GENERATION_STAGES);
export type CampaignGenerationStage = (typeof CAMPAIGN_GENERATION_STAGES)[number];

const fields = campaignPackageSchema.shape;
const location = campaignEntitySchema.extend({
  kind: z.literal('location'),
  location: campaignEntitySchema.shape.location.unwrap(),
});
const nonlocation = campaignEntitySchema.omit({ location: true }).extend({
  kind: z.enum(['character', 'npc', 'creature', 'item', 'feature', 'faction']),
});

/** These serializable shapes enforce ownership, not whole-package graph readiness. */
export const campaignGenerationOutputSchemas = {
  concept: z.object({ world: fields.world.omit({ language: true, startLocation: true }) }).strict(),
  topology: z
    .object({
      locations: z.array(location).max(500),
      startLocation: fields.world.shape.startLocation,
      conflicts: fields.conflicts,
    })
    .strict(),
  cast: z
    .object({
      entities: z.array(nonlocation).min(1).max(500),
      party: fields.party.min(1),
      relationships: fields.relationships,
      possessions: fields.possessions,
      visuals: fields.visuals,
    })
    .strict(),
  knowledge: campaignPackageSchema.pick({ knowledge: true, clues: true }),
  encounters: campaignPackageSchema.pick({ encounters: true }),
  'first-session': campaignPackageSchema.pick({
    situations: true,
    quests: true,
    firstSession: true,
  }),
  outline: campaignPackageSchema.pick({ laterOutline: true }),
} as const;

export type CampaignGenerationOutputByStage = {
  readonly [Stage in CampaignGenerationStage]: z.infer<
    (typeof campaignGenerationOutputSchemas)[Stage]
  >;
};
