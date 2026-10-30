import { z } from 'zod';

import {
  campaignPackageSchema,
  type CampaignPackage,
  type CampaignIdentities,
  type CampaignAssessment,
} from './package.ts';
import { workshopIdSchema } from '../workshop/access.ts';

export const campaignRevisionNumberSchema = z.number().int().min(0).max(1_000_000);
export const saveCampaignRevisionSchema = z
  .object({
    requestId: workshopIdSchema,
    basedOnRevision: campaignRevisionNumberSchema.max(999_999),
    content: campaignPackageSchema,
  })
  .strict();
export const campaignRevisionQuerySchema = z
  .object({
    before: z.coerce.number().int().min(1).max(1_000_000).optional(),
  })
  .strict();
export type CampaignRevisionSource =
  | { readonly kind: 'OWNER'; readonly actorId: string }
  | {
      readonly kind: 'AI';
      readonly jobId: string;
      readonly traceId: string;
      readonly provider: string;
      readonly model: string;
    };
export interface CampaignRevision {
  readonly draftId: string;
  readonly revision: number;
  readonly basedOnRevision: number;
  readonly content: CampaignPackage;
  readonly identities: CampaignIdentities;
  readonly digest: string;
  readonly source: CampaignRevisionSource;
  readonly createdAt: string;
}
export interface CampaignRevisionView {
  readonly revision: CampaignRevision | null;
  readonly assessment: CampaignAssessment;
}
export interface CampaignRevisionSummary {
  readonly revision: number;
  readonly basedOnRevision: number;
  readonly digest: string;
  readonly source: CampaignRevisionSource;
  readonly createdAt: string;
  readonly title: string;
}
