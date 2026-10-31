import {
  bootstrapAssetOriginSchema,
  bootstrapCampaignAssetSchema,
  ASSET_AUDIENCES,
  ASSET_FAILURES,
  ASSET_MEDIA_TYPES,
  ASSET_PURPOSES,
  ASSET_STATUSES,
  ASSET_VARIANTS,
  assetIdSchema,
  assetLabelSchema,
  assetRequestIdSchema,
  contentHashSchema,
  entityIdSchema,
} from '@ltw/contracts';
import { z } from 'zod';

/** Asset events and undo restores (docs/adr/0022-asset-identity.md). */
const variant = z.enum(ASSET_VARIANTS);
/**
 * Absent means `image` (ADR 0035 §4): the payloads before purposes existed, and every image
 * written since (`purposeField`), so adding purposes kept every type's version.
 */
const purpose = z.enum(ASSET_PURPOSES).optional();
const audience = z.enum(ASSET_AUDIENCES);
const label = assetLabelSchema.nullable();
const source = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('dm') }).strict(),
  z.object({ kind: z.literal('authoring'), proposalId: z.string().min(1).max(100) }).strict(),
]);
const note = z.string().min(1).max(300).nullable();
const generator = z
  .object({ provider: z.string().min(1).max(40), model: z.string().min(1).max(100) })
  .strict();

export const assetRequestedPayloadSchema = z
  .object({
    requestId: assetRequestIdSchema,
    entityId: entityIdSchema,
    variant,
    purpose,
    label,
    audience,
    note,
    derivedFrom: assetIdSchema.nullable(),
    source,
  })
  .strict();

/** The worker started the job; it copies the request, which an undo may later remove. */
export const assetJobStartedPayloadSchema = z
  .object({
    requestId: assetRequestIdSchema,
    entityId: entityIdSchema,
    variant,
    purpose,
    label,
    audience,
    note,
    derivedFrom: assetIdSchema.nullable(),
    source,
    requestedAt: z.number().int(),
  })
  .strict();

export const assetGeneratedPayloadSchema = z
  .object({
    assetId: assetIdSchema,
    requestId: assetRequestIdSchema,
    entityId: entityIdSchema,
    variant,
    purpose,
    label,
    audience,
    version: z.number().int().min(1),
    derivedFrom: assetIdSchema.nullable(),
    contentHash: contentHashSchema,
    mediaType: z.enum(ASSET_MEDIA_TYPES),
    generator,
    /** DISCARDED when the job was cancelled while it ran: kept for lineage, never shown. */
    status: z.enum(['CANDIDATE', 'DISCARDED']),
  })
  .strict();

export const assetJobFailedPayloadSchema = z
  .object({ requestId: assetRequestIdSchema, reason: z.enum(ASSET_FAILURES) })
  .strict();

export const assetRequestCancelledPayloadSchema = z
  .object({ requestId: assetRequestIdSchema, phase: z.enum(['queued', 'started']) })
  .strict();

export const assetRetractedPayloadSchema = z
  .object({ assetId: assetIdSchema, entityId: entityIdSchema, wasCanonical: z.boolean() })
  .strict();

/**
 * An approval as version 2 wrote it (Stages 150 to 330 part B): only a reference superseded
 * anything, the canonical reference it replaced (`previous`). Read alike, with nothing else
 * superseded (`event-versions.ts`).
 */
export const assetApprovedV2PayloadSchema = z
  .object({
    assetId: assetIdSchema,
    entityId: entityIdSchema,
    variant,
    /** The canonical reference this one replaces. */
    previous: assetIdSchema.nullable(),
  })
  .strict();

/**
 * Version 3 (ADR 0035, amendment "an approval supersedes its kind"): a derived picture also
 * supersedes the approved pictures of its kind (`supersedes`, absent when there are none): the
 * same entity and purpose, and for an image the same label (`sameKind`).
 */
export const assetApprovedPayloadSchema = assetApprovedV2PayloadSchema
  .extend({ supersedes: z.array(assetIdSchema).min(1).optional() })
  .strict();

export const assetAdoptedPayloadSchema = assetGeneratedPayloadSchema
  .extend({
    origin: bootstrapAssetOriginSchema,
    generator: bootstrapCampaignAssetSchema.shape.generator,
    status: z.literal('CANDIDATE'),
  })
  .strict();

const assetRecordSchema = z
  .object({
    assetId: assetIdSchema,
    requestId: assetRequestIdSchema,
    entityId: entityIdSchema,
    variant,
    purpose,
    label,
    audience,
    version: z.number().int().min(1),
    derivedFrom: assetIdSchema.nullable(),
    contentHash: contentHashSchema,
    mediaType: z.enum(ASSET_MEDIA_TYPES),
    generator,
    status: z.enum(ASSET_STATUSES),
    origin: bootstrapAssetOriginSchema.optional(),
  })
  .strict();

/** Undo restores: a request removed, an asset's earlier record, an entity's earlier canonical reference. */
export const assetRestoreSchemas = [
  z
    .object({ fact: z.literal('assetRequest'), requestId: assetRequestIdSchema, value: z.null() })
    .strict(),
  z.object({ fact: z.literal('asset'), assetId: assetIdSchema, value: assetRecordSchema }).strict(),
  z
    .object({
      fact: z.literal('assetCanonical'),
      entityId: entityIdSchema,
      value: assetIdSchema.nullable(),
    })
    .strict(),
] as const;
