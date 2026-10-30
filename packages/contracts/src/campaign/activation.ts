import { z } from 'zod';

import { ASSET_PURPOSES, assetLabelSchema, contentHashSchema } from '../assets/commands.ts';
import { campaignIdSchema } from '../kernel/identifiers.ts';
import { languageSchema } from '../language/language.ts';
import { workshopIdSchema } from '../workshop/access.ts';

export const ACTIVATION_PHASES = [
  'RESERVED',
  'CONTENT_READY',
  'BOOTSTRAPPED',
  'PUBLISHED',
] as const;
export const campaignActivationViewSchema = z
  .object({
    activationId: workshopIdSchema,
    draftId: workshopIdSchema,
    campaignId: campaignIdSchema,
    revision: z.number().int().min(1).max(1_000_000),
    packageDigest: contentHashSchema,
    planDigest: contentHashSchema,
    manifestDigest: contentHashSchema,
    textOnly: z.boolean(),
    status: z.enum(['PROVISIONING', 'PUBLISHED']),
    phase: z.enum(ACTIVATION_PHASES),
    failureCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,99}$/)
      .nullable(),
    retryable: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    publishedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type CampaignActivationView = z.infer<typeof campaignActivationViewSchema>;
export const campaignActivationAnswerSchema = z
  .object({
    activation: campaignActivationViewSchema.nullable(),
  })
  .strict();

export const campaignActivationFindingSchema = z
  .object({
    findingId: contentHashSchema,
    severity: z.enum(['error', 'warning', 'info']),
    code: z.string(),
    path: z.string(),
    message: z.string(),
  })
  .strict();
export type CampaignActivationFinding = z.infer<typeof campaignActivationFindingSchema>;
export const campaignActivationReviewSchema = z
  .object({
    draftId: workshopIdSchema,
    revision: z.number().int().min(1).max(1_000_000),
    title: z.string(),
    language: languageSchema,
    packageDigest: contentHashSchema,
    planDigest: contentHashSchema,
    scenarioDigest: contentHashSchema,
    questDigest: contentHashSchema,
    manifestVersion: z.number().int().min(0).max(1_000_000),
    manifestDigest: contentHashSchema,
    lockVersion: z.number().int().min(0).max(1_000_000),
    lockDigest: contentHashSchema,
    textOnly: z.boolean(),
    reviewDigest: contentHashSchema,
    readiness: z.enum(['READY', 'INCOMPLETE', 'INVALID']),
    findings: z.array(campaignActivationFindingSchema),
    visuals: z
      .object({
        selected: z.number().int().min(0),
        current: z.number().int().min(0),
        stale: z.number().int().min(0),
        missing: z.number().int().min(0),
        adopted: z.number().int().min(0),
        requiresTextOnly: z.boolean(),
        entries: z.array(
          z
            .object({
              entityId: workshopIdSchema,
              name: z.string(),
              purpose: z.enum(ASSET_PURPOSES),
              label: assetLabelSchema.nullable(),
              contentHash: contentHashSchema,
              state: z.enum(['CURRENT', 'STALE']),
            })
            .strict(),
        ),
      })
      .strict(),
    confirmable: z.boolean(),
    activation: campaignActivationViewSchema.nullable(),
  })
  .strict();
export type CampaignActivationReview = z.infer<typeof campaignActivationReviewSchema>;
export const startCampaignActivationSchema = z
  .object({
    requestId: workshopIdSchema,
    revision: z.number().int().min(1).max(1_000_000),
    packageDigest: contentHashSchema,
    planDigest: contentHashSchema,
    manifestVersion: z.number().int().min(0).max(1_000_000),
    manifestDigest: contentHashSchema,
    expectedLockVersion: z.number().int().min(0).max(1_000_000),
    lockDigest: contentHashSchema,
    reviewDigest: contentHashSchema,
    acknowledgedFindingIds: z.array(contentHashSchema).max(500),
    textOnly: z.boolean(),
  })
  .strict();
export type StartCampaignActivation = z.infer<typeof startCampaignActivationSchema>;
export const CAMPAIGN_ACTIVATION_CONFLICTS = [
  'REQUEST_REUSED',
  'STALE_REVISION',
  'STALE_LOCKS',
  'STALE_MANIFEST',
  'STALE_REVIEW',
  'ACKNOWLEDGEMENTS',
  'NOT_READY',
  'ALREADY_ACTIVATED',
] as const;
export const campaignActivationConflictSchema = z
  .object({
    conflict: z.object({ reason: z.enum(CAMPAIGN_ACTIVATION_CONFLICTS) }).strict(),
  })
  .strict();
export type CampaignActivationConflict = z.infer<typeof campaignActivationConflictSchema>;
export const ownedCampaignSchema = z
  .object({
    campaignId: campaignIdSchema,
    activationId: workshopIdSchema,
    draftId: workshopIdSchema,
    revision: z.number().int().min(1).max(1_000_000),
    title: z.string(),
    language: languageSchema,
    createdAt: z.iso.datetime(),
    publishedAt: z.iso.datetime(),
  })
  .strict();
export type OwnedCampaign = z.infer<typeof ownedCampaignSchema>;
export const ownedCampaignListSchema = z
  .object({
    campaigns: z.array(ownedCampaignSchema),
    nextCursor: workshopIdSchema.nullable(),
  })
  .strict();
export const campaignEntrySchema = z
  .object({
    link: z.url(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
