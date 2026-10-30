import { z } from 'zod';

import { workshopIdSchema } from '../workshop/access.ts';
import { campaignBriefSchema, type CampaignPackage } from './package.ts';
import type { CampaignRevisionSource } from './revisions.ts';

export const CAMPAIGN_GENERATION_STATUSES = [
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'DISPATCH_UNKNOWN',
] as const;
export type CampaignGenerationStatus = (typeof CAMPAIGN_GENERATION_STATUSES)[number];
export const enqueueCampaignGenerationSchema = z
  .object({
    requestId: workshopIdSchema,
    basedOnRevision: z.number().int().min(0).max(999_999),
    brief: campaignBriefSchema,
  })
  .strict();
export const retryCampaignGenerationSchema = z.object({ requestId: workshopIdSchema }).strict();

/** Private owner DTO. Lease/session/worker identity never crosses HTTP. */
export interface CampaignGenerationJob {
  /** Emitted for EDIT; absent preserves the historical GENERATE response shape. */
  readonly mode?: 'GENERATE' | 'EDIT';
  readonly jobId: string;
  readonly draftId: string;
  readonly baseRevision: number;
  readonly status: CampaignGenerationStatus;
  readonly nextStep: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attachedRevision: number | null;
  readonly candidateAvailable: boolean;
  readonly failureCode: string | null;
}
export interface CampaignGenerationStep {
  readonly ordinal: number;
  readonly stage: string;
  readonly status: 'PREPARED' | 'DISPATCHING' | 'SUCCEEDED';
  readonly traceId: string;
  readonly content: CampaignPackage | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
}
export interface CampaignGenerationCandidate {
  readonly jobId: string;
  readonly draftId: string;
  readonly baseRevision: number;
  readonly content: CampaignPackage;
  readonly contentDigest: string;
  readonly source: CampaignRevisionSource;
  readonly createdAt: string;
}
export interface CampaignGenerationView {
  readonly job: CampaignGenerationJob;
  readonly steps: readonly CampaignGenerationStep[];
  readonly candidate: CampaignGenerationCandidate | null;
}
export interface CampaignGenerationAvailability {
  readonly available: boolean;
  readonly reason: 'READY' | 'NO_ROUTE' | 'NO_PREPARATION_GRANT' | 'UNAVAILABLE';
  readonly providers: readonly string[];
}

/** Lightweight polling never carries generated scenario bodies or raw provider inputs. */
export type CampaignGenerationProgressStep = Omit<CampaignGenerationStep, 'content'>;
export interface CampaignGenerationProgressView {
  /** Lightweight EDIT context only; no frozen scope, locks, projections or provider input. */
  readonly edit?: { readonly instruction: string; readonly requestedTargets: readonly string[] };
  readonly job: CampaignGenerationJob;
  readonly brief: CampaignPackage['brief'];
  readonly steps: readonly CampaignGenerationProgressStep[];
  readonly candidate: Pick<
    CampaignGenerationCandidate,
    'contentDigest' | 'baseRevision' | 'createdAt'
  > | null;
}
