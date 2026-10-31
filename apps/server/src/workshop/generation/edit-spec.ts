import {
  campaignEditTargetIdSchema,
  contentHashSchema,
  draftLockTargetSchema,
  type CampaignEditSpec,
} from '@ltw/contracts';
import { z } from 'zod';

import { imageDigest } from '../images/manifest.ts';
import { campaignCanonicalJson, MAX_CAMPAIGN_PACKAGE_BYTES } from '../packages/content.ts';

const version = z.number().int().min(0).max(1000000);
const entry = z
  .object({
    target: draftLockTargetSchema,
    label: z.string().max(4000),
    projection: z.unknown(),
    digest: contentHashSchema,
  })
  .strict();
export const campaignEditSpecSchema = z
  .object({
    version: z.literal(1),
    baselineDigest: contentHashSchema,
    instruction: z.string().trim().min(1).max(8000),
    requestedTargets: z.array(campaignEditTargetIdSchema).min(1).max(100),
    closure: z
      .array(
        z
          .object({
            targetId: campaignEditTargetIdSchema,
            reasons: z.array(z.string().max(4000)).max(100),
            readOnly: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(5000),
    lockSnapshot: z
      .object({
        version,
        revision: version,
        packageDigest: contentHashSchema,
        manifestDigest: contentHashSchema,
        digest: contentHashSchema,
        entries: z.array(entry).max(500),
        createdAt: z.iso.datetime(),
      })
      .strict(),
    manifestVersion: version,
    manifestDigest: contentHashSchema,
  })
  .strict();
export function parseCampaignEditSpec(value: unknown): CampaignEditSpec {
  const spec = campaignEditSpecSchema.parse(value);
  const snapshot = {
    version: spec.lockSnapshot.version,
    revision: spec.lockSnapshot.revision,
    packageDigest: spec.lockSnapshot.packageDigest,
    manifestDigest: spec.lockSnapshot.manifestDigest,
    entries: spec.lockSnapshot.entries,
  };
  const digest = spec.lockSnapshot.digest;
  if (
    digest !== imageDigest(snapshot) ||
    snapshot.entries.some((item) => imageDigest(item.projection) !== item.digest) ||
    new Set(spec.requestedTargets).size !== spec.requestedTargets.length ||
    new Set(spec.closure.map((item) => item.targetId)).size !== spec.closure.length ||
    Buffer.byteLength(campaignCanonicalJson(spec), 'utf8') > MAX_CAMPAIGN_PACKAGE_BYTES
  )
    throw new Error('INVALID_EDIT_SPEC');
  return spec;
}
