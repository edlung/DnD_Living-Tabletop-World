import { z } from 'zod';

import {
  ASSET_PURPOSES,
  ASSET_VARIANTS,
  assetLabelSchema,
  contentHashSchema,
  completeAssetJobCommandSchema,
} from '../assets/commands.ts';
import { entityIdSchema, sceneIdSchema } from '../kernel/identifiers.ts';
import { workshopIdSchema } from '../workshop/access.ts';
import { campaignPackageSchema } from './package.ts';
import { campaignKeySchema } from './story.ts';

export const MAX_BOOTSTRAP_ASSETS = 1000;
export const MAX_BOOTSTRAP_OPERATIONS = 6000;
export const MAX_BOOTSTRAP_EVENTS = 10000;
export const MAX_BOOTSTRAP_BYTES = 2 * 1024 * 1024;
export const bootstrapAssetOriginSchema = z
  .object({
    draftId: workshopIdSchema,
    revision: z.number().int().min(1).max(1000000),
    candidateId: workshopIdSchema,
    jobId: workshopIdSchema,
    sourceSignature: contentHashSchema,
    referenceHash: contentHashSchema.nullable(),
    manifestDigest: contentHashSchema,
  })
  .strict();
export const bootstrapCampaignAssetSchema = z
  .object({
    entityId: entityIdSchema,
    purpose: z.enum(ASSET_PURPOSES),
    variant: z.enum(ASSET_VARIANTS),
    label: assetLabelSchema.nullable(),
    audience: z.literal('players'),
    contentHash: contentHashSchema,
    mediaType: z.enum(['image/png', 'image/webp']),
    generator: completeAssetJobCommandSchema.shape.generator,
    origin: bootstrapAssetOriginSchema,
  })
  .strict();
export type CampaignBootstrapAsset = z.infer<typeof bootstrapCampaignAssetSchema>;
const identities = z
  .object({
    entities: z.record(campaignKeySchema, entityIdSchema),
    knowledge: z.record(campaignKeySchema, entityIdSchema),
    clues: z.record(campaignKeySchema, entityIdSchema),
    encounters: z.record(campaignKeySchema, entityIdSchema),
    scene: sceneIdSchema,
  })
  .strict();
export const bootstrapCampaignCommandSchema = z
  .object({
    type: z.literal('BootstrapCampaign'),
    content: campaignPackageSchema,
    identities,
    source: z
      .object({
        activationId: workshopIdSchema,
        ownerId: workshopIdSchema,
        draftId: workshopIdSchema,
        revision: z.number().int().min(1).max(1000000),
        packageDigest: contentHashSchema,
        planDigest: contentHashSchema,
        visualManifestDigest: contentHashSchema,
        scenarioDigest: contentHashSchema,
        questDigest: contentHashSchema,
        lockDigest: contentHashSchema,
      })
      .strict(),
    visualMode: z.enum(['CHOSEN', 'TEXT_ONLY']),
    selectedAssets: z.array(bootstrapCampaignAssetSchema).max(MAX_BOOTSTRAP_ASSETS),
    confirmation: z
      .object({
        packageDigest: contentHashSchema,
        planDigest: contentHashSchema,
        visualManifestDigest: contentHashSchema,
        reviewDigest: contentHashSchema,
        acknowledgedFindingIds: z.array(contentHashSchema).max(500),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BOOTSTRAP_BYTES)
      context.addIssue({ code: 'custom', message: 'Bootstrap content exceeds its bounded size' });
  });
export type BootstrapCampaignCommand = z.infer<typeof bootstrapCampaignCommandSchema>;
