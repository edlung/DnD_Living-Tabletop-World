import {
  ASSET_MEDIA_TYPES,
  ASSET_PURPOSES,
  ASSET_VARIANTS,
  ENTITY_KINDS,
  contentHashSchema,
  workshopIdSchema,
} from '@ltw/contracts';
import { z } from 'zod';

const id = workshopIdSchema;
const hash = contentHashSchema;
const time = z.iso.datetime();
const slot = z
  .object({
    entityId: id,
    purpose: z.enum(ASSET_PURPOSES),
    variant: z.enum(ASSET_VARIANTS),
    label: z.string().nullable(),
  })
  .strict();
export const pictureJobSchema = slot.extend({
  jobId: id,
  revision: z.number().int().min(1),
  status: z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'DISPATCH_UNKNOWN']),
  createdAt: time,
  updatedAt: time,
  failureCode: z.string().nullable(),
});
const candidate = slot.extend({
  candidateId: id,
  jobId: id,
  sourceRevision: z.number().int().min(1),
  contentHash: hash,
  mediaType: z.enum(ASSET_MEDIA_TYPES),
  sourceSignature: z.string(),
  referenceHash: hash.nullable(),
  provider: z.string(),
  model: z.string(),
  createdAt: time,
});
const entry = slot.extend({
  candidateId: id,
  contentHash: hash,
  mediaType: z.enum(ASSET_MEDIA_TYPES),
  sourceRevision: z.number().int().min(1),
  sourceSignature: z.string(),
  referenceHash: hash.nullable(),
  state: z.enum(['CURRENT', 'STALE']),
  staleReason: z.enum(['SOURCE_CHANGED', 'REFERENCE_CHANGED', 'SUBJECT_REMOVED']).nullable(),
});
export const manifestSchema = z
  .object({
    revision: z.number().int().min(1),
    version: z.number().int().min(0),
    packageDigest: hash,
    digest: hash,
    entries: z.array(entry),
    createdAt: time,
  })
  .strict();
export const picturesSchema = z
  .object({
    manifest: manifestSchema,
    subjects: z.array(
      z
        .object({
          entityId: id,
          name: z.string(),
          kind: z.enum(ENTITY_KINDS),
          appearance: z.string(),
          style: z.string(),
          allowedPurposes: z.array(z.enum(ASSET_PURPOSES)),
          referenceHash: hash.nullable(),
          briefs: z.array(
            z
              .object({
                purpose: z.enum(ASSET_PURPOSES),
                appearance: z.string(),
                style: z.string(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    jobs: z.array(pictureJobSchema),
    candidates: z.array(candidate),
    jobsNextCursor: id.nullable(),
    candidatesNextCursor: id.nullable(),
    availability: z
      .object({
        available: z.boolean(),
        reason: z.enum(['READY', 'NO_ROUTE', 'NO_POLICY', 'UNAVAILABLE']),
        providers: z.array(z.string()),
      })
      .strict(),
  })
  .strict();
export const pictureJobAnswerSchema = z.object({ job: pictureJobSchema }).strict();
export const selectionAnswerSchema = z.object({ manifest: manifestSchema }).strict();
