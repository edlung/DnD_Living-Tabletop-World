import { createHash } from 'node:crypto';

import {
  campaignPackageSchema,
  saveCampaignRevisionSchema,
  workshopIdSchema,
  type CampaignIdentities,
  type CampaignRevisionSource,
  type CampaignRevisionSummary,
} from '@ltw/contracts';
import { z } from 'zod';

import type { AppendCampaignRevision } from './store.ts';
import type { CampaignRevision } from '@ltw/contracts';

export const MAX_CAMPAIGN_PACKAGE_BYTES = 512 * 1024;
const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('OWNER'), actorId: workshopIdSchema }).strict(),
  z
    .object({
      kind: z.literal('AI'),
      jobId: workshopIdSchema,
      traceId: workshopIdSchema,
      provider: z.string().min(1).max(100),
      model: z.string().min(1).max(200),
    })
    .strict(),
]);

/** Sorted JSON object keys, preserved array order; no dependency on caller insertion order. */
export function campaignCanonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(campaignCanonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${campaignCanonicalJson(object[key])}`)
    .join(',')}}`;
}
const sha256 = (value: unknown): string =>
  `sha256:${createHash('sha256').update(campaignCanonicalJson(value)).digest('hex')}`;

export function normalizeCampaignAppend(input: AppendCampaignRevision): AppendCampaignRevision {
  const request = saveCampaignRevisionSchema.safeParse({
    requestId: input.requestId,
    basedOnRevision: input.basedOnRevision,
    content: input.content,
    expectedLockVersion: input.expectedLockVersion,
    expectedManifestVersion: input.expectedManifestVersion,
    expectedManifestDigest: input.expectedManifestDigest,
  });
  const source = sourceSchema.safeParse(input.source);
  const validTime = z.iso.datetime().safeParse(input.createdAt).success;
  if (
    !request.success ||
    !source.success ||
    !validTime ||
    !workshopIdSchema.safeParse(input.ownerId).success ||
    !workshopIdSchema.safeParse(input.draftId).success ||
    !z
      .number()
      .int()
      .min(0)
      .max(1_000_000)
      .safeParse(input.expectedLockVersion ?? 0).success ||
    (source.data.kind === 'OWNER' && source.data.actorId !== input.ownerId) ||
    Buffer.byteLength(campaignCanonicalJson(request.data.content), 'utf8') >
      MAX_CAMPAIGN_PACKAGE_BYTES
  ) {
    throw new Error('INVALID_CAMPAIGN_REVISION');
  }
  return { ...input, content: request.data.content, source: source.data };
}

export const campaignContentDigest = (content: unknown, identities: CampaignIdentities): string =>
  sha256({ content, identities });
export const campaignRequestFingerprint = (
  input: Pick<AppendCampaignRevision, 'basedOnRevision' | 'content' | 'source'>,
): string =>
  sha256({ basedOnRevision: input.basedOnRevision, content: input.content, source: input.source });

/** Decode defensively: schema and digest survive restarts and detect storage corruption. */
export function parseStoredCampaignContent(value: unknown) {
  return campaignPackageSchema.parse(value);
}
export function parseStoredCampaignSource(value: unknown): CampaignRevisionSource {
  return sourceSchema.parse(value);
}
export function campaignRevisionSummary(revision: CampaignRevision): CampaignRevisionSummary {
  return {
    revision: revision.revision,
    basedOnRevision: revision.basedOnRevision,
    digest: revision.digest,
    source: revision.source,
    createdAt: revision.createdAt,
    title: revision.content.world.name,
  };
}
