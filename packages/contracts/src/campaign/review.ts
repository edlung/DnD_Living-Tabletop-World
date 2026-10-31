import { z } from 'zod';

import { contentHashSchema } from '../assets/commands.ts';
import { workshopIdSchema } from '../workshop/access.ts';
import type { CampaignAssessment, CampaignPackage } from './package.ts';
import type { CampaignRevision } from './revisions.ts';
import type { CampaignEditTarget, CampaignEditSpec } from './edits.ts';
import { draftLockTargetSchema, type DraftLockConflict, type DraftLockSnapshot } from './locks.ts';
import type { DraftVisualManifest } from './images.ts';

export interface CampaignEditingContext {
  readonly revision: CampaignRevision;
  readonly assessment: CampaignAssessment;
  readonly locks: DraftLockSnapshot;
  readonly manifest: DraftVisualManifest;
  readonly targets: readonly CampaignEditTarget[];
}
export interface CampaignFieldChange {
  readonly path: readonly (string | number)[];
  readonly targetId: string;
  readonly kind: 'ADDED' | 'REMOVED' | 'CHANGED' | 'ORDER';
  /** Null stands for the absent side of ADDED/REMOVED; kind keeps it distinct from a real null. */
  readonly before: unknown;
  readonly after: unknown;
}
export interface CampaignVisualChange {
  readonly entityId: string;
  readonly purpose: 'image' | 'figure' | 'battle-map';
  readonly label: string | null;
  readonly beforeState: 'CURRENT' | 'STALE' | 'MISSING';
  readonly afterState: 'CURRENT' | 'STALE' | 'MISSING';
  readonly beforeHash: string | null;
  readonly afterHash: string | null;
}
export interface CampaignRevisionReview {
  readonly kind: 'EDIT' | 'RESTORE' | 'COMPARE';
  readonly sourceId: string;
  readonly candidateDigest: string;
  readonly before: CampaignRevision;
  readonly after: CampaignPackage;
  readonly changes: readonly CampaignFieldChange[];
  readonly visualChanges: readonly CampaignVisualChange[];
  readonly assessment: CampaignAssessment;
  readonly conflicts: readonly DraftLockConflict[];
  readonly issues: readonly string[];
  readonly locks: DraftLockSnapshot;
  readonly manifest: DraftVisualManifest;
  readonly reviewDigest: string;
  readonly adoptable: boolean;
  readonly targets: readonly CampaignEditTarget[];
  readonly editSpec?: CampaignEditSpec;
}
const reviewedWrite = z
  .object({
    requestId: workshopIdSchema,
    basedOnRevision: z.number().int().min(1).max(999999),
    packageDigest: contentHashSchema,
    expectedLockVersion: z.number().int().min(0).max(1000000),
    manifestVersion: z.number().int().min(0).max(1000000),
    manifestDigest: contentHashSchema,
    reviewDigest: contentHashSchema,
  })
  .strict();
export const adoptCampaignEditSchema = reviewedWrite
  .extend({ candidateDigest: contentHashSchema })
  .strict();
export const restoreCampaignRevisionSchema = reviewedWrite;
export const CAMPAIGN_REVISION_CONFLICTS = [
  'REQUEST_REUSED',
  'STALE_REVISION',
  'STALE_LOCKS',
  'STALE_MANIFEST',
  'STALE_REVIEW',
  'LOCKED_CONTENT',
  'INVALID_TARGET',
  'INVALID_CANDIDATE',
  'IDENTITY_KIND_CHANGED',
] as const;
export const campaignRevisionConflictSchema = z
  .object({
    conflict: z
      .object({
        reason: z.enum(CAMPAIGN_REVISION_CONFLICTS),
        conflicts: z
          .array(
            z
              .object({
                target: draftLockTargetSchema,
                label: z.string(),
                reason: z.enum(['CONTENT_CHANGED', 'IMAGE_CHANGED', 'TARGET_MISSING']),
              })
              .strict(),
          )
          .optional(),
      })
      .strict(),
  })
  .strict();
export type CampaignRevisionConflictView = z.infer<typeof campaignRevisionConflictSchema>;
