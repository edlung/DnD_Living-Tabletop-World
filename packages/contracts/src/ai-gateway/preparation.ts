import type { AiAttemptView } from './intents.ts';

export interface WorkshopAiSubject {
  readonly kind: 'workshop';
  readonly ownerId: string;
  readonly draftId: string;
}

/** Owner-private generation evidence; never a live campaign trace or authoring proposal. */
export interface CampaignPreparationTraceView {
  readonly traceId: string;
  readonly campaignId: null;
  readonly subject: WorkshopAiSubject;
  readonly actorId: string;
  readonly purpose: 'campaign-preparation';
  readonly capability: 'campaign-preparation';
  readonly scope: string;
  readonly sourceIds: readonly string[];
  readonly input: string;
  readonly jobId: string;
  readonly stage: string;
  readonly status: 'GENERATED' | 'AI_UNAVAILABLE' | 'INVALID_OUTPUT' | 'DISPATCH_UNKNOWN';
  readonly attempts: readonly AiAttemptView[];
  readonly issues: readonly string[];
  readonly canonicalEvents: readonly string[];
  readonly createdAt: string;
}
