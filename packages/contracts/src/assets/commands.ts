import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * Asset identity (docs/adr/0022-asset-identity.md). Assets depict world
 * entities; they are never world state (invariant 14). Requests, external
 * jobs, and the assets they produce form a lineage the World Engine records.
 * The DM requests, cancels, retracts, and approves; only the asset worker (a
 * system process) reports what external work did.
 */
export const ASSET_VARIANTS = ['reference', 'derived'] as const;
export type AssetVariant = (typeof ASSET_VARIANTS)[number];

/** Who may ever see an approved asset: players (of entities they know or see), or the DM only. */
export const ASSET_AUDIENCES = ['players', 'dm'] as const;
export type AssetAudience = (typeof ASSET_AUDIENCES)[number];

export const ASSET_REQUEST_STATUSES = [
  'QUEUED',
  'STARTED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type AssetRequestStatus = (typeof ASSET_REQUEST_STATUSES)[number];

export const ASSET_STATUSES = [
  'CANDIDATE',
  'CANONICAL',
  'APPROVED',
  'SUPERSEDED',
  'RETRACTED',
  'DISCARDED',
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

/**
 * Why a job produced no image. `UNAVAILABLE` (docs/adr/0035-images.md): no provider call was made,
 * because no image budget is stored, the ceiling is reached, or the generator holds no such image.
 */
export const ASSET_FAILURES = ['PROVIDER_ERROR', 'REFUSED', 'TIMEOUT', 'UNAVAILABLE'] as const;
export type AssetFailure = (typeof ASSET_FAILURES)[number];

/**
 * What an image is for (docs/adr/0035-images.md §4): `image` (an entity's picture, chosen by state
 * tags, ADR 0023), `figure` (a character's tabletop figure) or `battle-map` (a place's top-down map
 * under the encounter grid). A figure and a battle map are derived variants of the canonical
 * reference. Requests and events written before purposes existed are `image`.
 */
export const ASSET_PURPOSES = ['image', 'figure', 'battle-map'] as const;
export type AssetPurpose = (typeof ASSET_PURPOSES)[number];

export const ASSET_MEDIA_TYPES = ['image/svg+xml', 'image/png', 'image/webp'] as const;
export type AssetMediaType = (typeof ASSET_MEDIA_TYPES)[number];

/** Request IDs derive from the requesting command's ID (`<commandId>#<n>`); asset IDs from the request. */
export const assetRequestIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,299}#[0-9]{1,3}$/);
export const assetIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,299}#[0-9]{1,3}~asset$/);
/** Content address of an asset's bytes; the only asset handle players ever see. */
export const contentHashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const assetLabelSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);

export const requestAssetCommandSchema = z
  .object({
    type: z.literal('RequestAsset'),
    entityId: entityIdSchema,
    /** `reference`: the entity's visual identity; `derived`: a variant of its canonical reference. */
    variant: z.enum(ASSET_VARIANTS),
    /** DM-only label, required for a derived variant (for example `smiling` or `night`). */
    label: assetLabelSchema.optional(),
    audience: z.enum(ASSET_AUDIENCES).optional(),
    /** DM-only direction for the generator. */
    note: z.string().trim().min(1).max(300).optional(),
    /** `image` by default; a `figure` or `battle-map` is a derived variant (ADR 0035 §4). */
    purpose: z.enum(ASSET_PURPOSES).optional(),
  })
  .strict();

export const startAssetJobCommandSchema = z
  .object({ type: z.literal('StartAssetJob'), requestId: assetRequestIdSchema })
  .strict();

export const completeAssetJobCommandSchema = z
  .object({
    type: z.literal('CompleteAssetJob'),
    requestId: assetRequestIdSchema,
    contentHash: contentHashSchema,
    mediaType: z.enum(ASSET_MEDIA_TYPES),
    generator: z
      .object({
        provider: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
        model: z.string().trim().min(1).max(100),
      })
      .strict(),
  })
  .strict();

export const failAssetJobCommandSchema = z
  .object({
    type: z.literal('FailAssetJob'),
    requestId: assetRequestIdSchema,
    reason: z.enum(ASSET_FAILURES),
  })
  .strict();

export const cancelAssetRequestCommandSchema = z
  .object({ type: z.literal('CancelAssetRequest'), requestId: assetRequestIdSchema })
  .strict();

export const retractAssetCommandSchema = z
  .object({ type: z.literal('RetractAsset'), assetId: assetIdSchema })
  .strict();

export const approveAssetCommandSchema = z
  .object({ type: z.literal('ApproveAsset'), assetId: assetIdSchema })
  .strict();

/** Reports of external work: the asset worker (a system process) only. */
export const ASSET_WORKER_COMMAND_TYPES = [
  'StartAssetJob',
  'CompleteAssetJob',
  'FailAssetJob',
] as const;

/**
 * Commands that settle external work. They are final (never undone) and the
 * re-decision oracle folds them as recorded, like the dice of a roll.
 */
export const ASSET_SETTLING_COMMAND_TYPES = [
  ...ASSET_WORKER_COMMAND_TYPES,
  'CancelAssetRequest',
  'RetractAsset',
] as const;

/**
 * A player's wish for a portrait of their own character (docs/adr/0056-characters-from-the-srd.md
 * §5): how they see it, for the DM to turn into a picture request. Nothing is generated until the
 * DM asks for it: the image key and its costs stay the DM's.
 */
export const askPortraitCommandSchema = z
  .object({
    type: z.literal('AskPortrait'),
    characterId: entityIdSchema,
    look: z.string().trim().min(1).max(300),
  })
  .strict();
