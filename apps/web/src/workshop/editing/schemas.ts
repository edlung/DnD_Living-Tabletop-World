import {
  campaignEditTargetSchema,
  campaignPackageSchema,
  draftLockTargetSchema,
} from '@ltw/contracts';
import { z } from 'zod';

import { manifestSchema } from '../pictures/schemas.ts';
import { assessmentSchema, revisionSchema, revisionViewSchema } from '../response-schemas.ts';

export const lockSnapshotSchema = z
  .object({
    version: z.number().int().min(0),
    revision: z.number().int().min(0),
    packageDigest: z.string(),
    manifestDigest: z.string(),
    digest: z.string(),
    createdAt: z.iso.datetime(),
    entries: z.array(
      z
        .object({
          target: draftLockTargetSchema,
          label: z.string(),
          projection: z.unknown(),
          digest: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export const editingContextSchema = z
  .object({
    revision: revisionSchema,
    assessment: assessmentSchema,
    locks: lockSnapshotSchema,
    manifest: manifestSchema,
    targets: z.array(campaignEditTargetSchema),
  })
  .strict();
export type EditingContext = z.infer<typeof editingContextSchema>;
export const lockAnswerSchema = z.object({ locks: lockSnapshotSchema }).strict();
export const editSpecSchema = z
  .object({
    version: z.literal(1),
    baselineDigest: z.string(),
    instruction: z.string(),
    requestedTargets: z.array(z.string()),
    closure: z.array(
      z
        .object({ targetId: z.string(), reasons: z.array(z.string()), readOnly: z.boolean() })
        .strict(),
    ),
    lockSnapshot: lockSnapshotSchema,
    manifestVersion: z.number().int().min(0),
    manifestDigest: z.string(),
  })
  .strict();
export const editPlanSchema = z
  .object({
    spec: editSpecSchema.nullable(),
    targets: z.array(campaignEditTargetSchema),
    conflicts: z.array(
      z
        .object({
          targetId: z.string(),
          label: z.string(),
          reason: z.enum(['LOCKED', 'AMBIGUOUS', 'MISSING']),
        })
        .strict(),
    ),
  })
  .strict();
const visualState = z.enum(['CURRENT', 'STALE', 'MISSING']);
export const revisionReviewSchema = z
  .object({
    kind: z.enum(['EDIT', 'RESTORE', 'COMPARE']),
    sourceId: z.string(),
    candidateDigest: z.string(),
    targets: z.array(campaignEditTargetSchema),
    editSpec: editSpecSchema.optional(),
    before: revisionSchema,
    after: campaignPackageSchema,
    changes: z.array(
      z
        .object({
          path: z.array(z.union([z.string(), z.number().int().min(0)])),
          targetId: z.string(),
          kind: z.enum(['ADDED', 'REMOVED', 'CHANGED', 'ORDER']),
          before: z.unknown(),
          after: z.unknown(),
        })
        .strict(),
    ),
    visualChanges: z.array(
      z
        .object({
          entityId: z.string(),
          purpose: z.enum(['image', 'figure', 'battle-map']),
          label: z.string().nullable(),
          beforeState: visualState,
          afterState: visualState,
          beforeHash: z.string().nullable(),
          afterHash: z.string().nullable(),
        })
        .strict(),
    ),
    assessment: assessmentSchema,
    conflicts: z.array(
      z
        .object({
          target: draftLockTargetSchema,
          label: z.string(),
          reason: z.enum(['CONTENT_CHANGED', 'IMAGE_CHANGED', 'TARGET_MISSING']),
        })
        .strict(),
    ),
    issues: z.array(z.string()),
    locks: lockSnapshotSchema,
    manifest: manifestSchema,
    reviewDigest: z.string(),
    adoptable: z.boolean(),
  })
  .strict();
export const reviewedWriteAnswerSchema = revisionViewSchema;
