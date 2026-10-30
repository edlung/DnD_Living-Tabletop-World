import { z } from 'zod';

import {
  ASSET_PURPOSES,
  ASSET_VARIANTS,
  assetLabelSchema,
  contentHashSchema,
} from '../assets/commands.ts';
import type { AssetMediaType, AssetPurpose, AssetVariant } from '../assets/commands.ts';
import type { EntityKind } from '../kernel/world-commands.ts';
import { workshopIdSchema } from '../workshop/access.ts';

const revision = z.number().int().min(1).max(1_000_000);
const visualCAS = z
  .object({
    requestId: workshopIdSchema,
    revision,
    packageDigest: contentHashSchema,
    expectedManifestVersion: z.number().int().min(0).max(1_000_000),
    entityId: workshopIdSchema,
    purpose: z.enum(ASSET_PURPOSES),
    variant: z.enum(ASSET_VARIANTS),
    label: assetLabelSchema.nullable().default(null),
  })
  .strict();
const supportedSlot = (slot: {
  purpose: AssetPurpose;
  variant: AssetVariant;
  label: string | null;
}) =>
  slot.purpose === 'image'
    ? slot.variant === 'reference' && slot.label === null
    : slot.variant === 'derived' && slot.label === slot.purpose;
export const requestDraftImageSchema = visualCAS
  .extend({ note: z.string().trim().min(1).max(300).nullable().default(null) })
  .strict()
  .refine(supportedSlot, { message: 'Unsupported draft image slot' });
export const selectDraftImageSchema = visualCAS
  .extend({ candidateId: workshopIdSchema.nullable() })
  .strict()
  .refine(supportedSlot, { message: 'Unsupported draft image slot' });
export interface DraftImageSlot {
  readonly entityId: string;
  readonly purpose: AssetPurpose;
  readonly variant: AssetVariant;
  readonly label: string | null;
}
export type DraftImageStatus =
  'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'DISPATCH_UNKNOWN';
export interface DraftImageJob extends DraftImageSlot {
  readonly jobId: string;
  readonly revision: number;
  readonly status: DraftImageStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly failureCode: string | null;
}
export interface DraftImageCandidate extends DraftImageSlot {
  readonly candidateId: string;
  readonly jobId: string;
  readonly sourceRevision: number;
  readonly contentHash: string;
  readonly mediaType: AssetMediaType;
  readonly sourceSignature: string;
  readonly referenceHash: string | null;
  readonly provider: string;
  readonly model: string;
  readonly createdAt: string;
}
export interface DraftVisualEntry extends DraftImageSlot {
  readonly candidateId: string;
  readonly contentHash: string;
  readonly mediaType: AssetMediaType;
  readonly sourceRevision: number;
  readonly sourceSignature: string;
  readonly referenceHash: string | null;
  readonly state: 'CURRENT' | 'STALE';
  readonly staleReason: 'SOURCE_CHANGED' | 'REFERENCE_CHANGED' | 'SUBJECT_REMOVED' | null;
}
export interface DraftVisualManifest {
  readonly revision: number;
  readonly version: number;
  readonly packageDigest: string;
  readonly digest: string;
  readonly entries: readonly DraftVisualEntry[];
  readonly createdAt: string;
}
/** Owner-only image controls; never include these fields in a character preview. */
export interface DraftImageSubject {
  readonly entityId: string;
  readonly name: string;
  readonly kind: EntityKind;
  readonly appearance: string;
  readonly style: string;
  readonly allowedPurposes: readonly AssetPurpose[];
  readonly briefs: readonly {
    readonly purpose: AssetPurpose;
    readonly appearance: string;
    readonly style: string;
  }[];
  readonly referenceHash: string | null;
}
export interface DraftImageAvailability {
  readonly available: boolean;
  readonly reason: 'READY' | 'NO_ROUTE' | 'NO_POLICY' | 'UNAVAILABLE';
  readonly providers: readonly string[];
}
export interface CampaignDraftImagesView {
  readonly manifest: DraftVisualManifest;
  readonly subjects: readonly DraftImageSubject[];
  readonly jobs: readonly DraftImageJob[];
  readonly candidates: readonly DraftImageCandidate[];
  readonly jobsNextCursor: string | null;
  readonly candidatesNextCursor: string | null;
  readonly availability: DraftImageAvailability;
}
