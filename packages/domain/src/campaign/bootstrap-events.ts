import { bootstrapCampaignCommandSchema, entityIdSchema } from '@ltw/contracts';
import { z } from 'zod';

export const preparedPartyEstablishedPayloadSchema = z
  .object({ characterIds: z.array(entityIdSchema).min(1).max(16) })
  .strict();
export const campaignBootstrappedPayloadSchema = z
  .object({
    source: bootstrapCampaignCommandSchema.shape.source,
    visualMode: bootstrapCampaignCommandSchema.shape.visualMode,
    confirmation: bootstrapCampaignCommandSchema.shape.confirmation,
  })
  .strict();
