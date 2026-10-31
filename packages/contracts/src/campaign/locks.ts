import { z } from 'zod';

import { ASSET_PURPOSES, ASSET_VARIANTS, contentHashSchema } from '../assets/commands.ts';
import { workshopIdSchema } from '../workshop/access.ts';
import { campaignRevisionNumberSchema } from './revisions.ts';

export const draftLockTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('content'), targetId: z.string().min(1).max(300) }).strict(),
  z
    .object({
      kind: z.literal('image'),
      entityId: workshopIdSchema,
      purpose: z.enum(ASSET_PURPOSES),
      variant: z.enum(ASSET_VARIANTS),
      label: z.string().max(120).nullable(),
    })
    .strict(),
]);
export type DraftLockTarget = z.infer<typeof draftLockTargetSchema>;

export const replaceDraftLocksSchema = z
  .object({
    requestId: workshopIdSchema,
    revision: campaignRevisionNumberSchema.min(1),
    packageDigest: contentHashSchema,
    expectedLockVersion: z.number().int().min(0).max(1_000_000),
    manifestVersion: z.number().int().min(0).max(1_000_000),
    manifestDigest: contentHashSchema,
    targets: z.array(draftLockTargetSchema).max(500),
  })
  .strict();

/** Exact projections are computed by the server and readable only by the owner. */
export interface DraftLockEntry {
  readonly target: DraftLockTarget;
  readonly label: string;
  readonly projection: unknown;
  readonly digest: string;
}
export interface DraftLockSnapshot {
  readonly version: number;
  readonly revision: number;
  readonly packageDigest: string;
  readonly manifestDigest: string;
  readonly digest: string;
  readonly entries: readonly DraftLockEntry[];
  readonly createdAt: string;
}
export interface DraftLockConflict {
  readonly target: DraftLockTarget;
  readonly label: string;
  readonly reason: 'CONTENT_CHANGED' | 'IMAGE_CHANGED' | 'TARGET_MISSING';
}
