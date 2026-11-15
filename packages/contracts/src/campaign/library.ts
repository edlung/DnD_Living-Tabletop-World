import { z } from 'zod';

/**
 * The campaign library the workshop offers (docs/adr/0058-campaign-content.md, notes of
 * 2026-11-14): authored campaigns a DM picks into an empty draft, each in party variants.
 */
const libraryIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
const variantIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/);

export const campaignLibraryVariantSchema = z
  .object({
    id: variantIdSchema,
    players: z.number().int().min(1).max(8),
    label: z.string().min(1).max(80),
  })
  .strict();

export const campaignLibraryEntrySchema = z
  .object({
    id: libraryIdSchema,
    title: z.string().min(1).max(160),
    genre: z.string().min(1).max(80),
    audience: z.string().min(1).max(8),
    pitch: z.string().min(1).max(2000),
    tone: z.string().max(2000),
    duration: z.string().max(400),
    /** How many pictures arrive with the campaign once it is started. */
    pictures: z.number().int().min(0),
    defaultVariant: variantIdSchema,
    variants: z.array(campaignLibraryVariantSchema).min(1),
  })
  .strict();

/** `GET /workshop/library` */
export const campaignLibraryResponseSchema = z
  .object({ campaigns: z.array(campaignLibraryEntrySchema) })
  .strict();

/** `GET /workshop/library/:campaignId/packages/:variantId` path. */
export const campaignLibraryPackagePathSchema = z
  .object({ campaignId: libraryIdSchema, variantId: variantIdSchema })
  .strict();

export type CampaignLibraryVariant = z.infer<typeof campaignLibraryVariantSchema>;
export type CampaignLibraryEntry = z.infer<typeof campaignLibraryEntrySchema>;
export type CampaignLibraryResponse = z.infer<typeof campaignLibraryResponseSchema>;
