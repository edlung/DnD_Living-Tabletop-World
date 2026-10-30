import type { CampaignGenerationJob, CampaignGenerationStep } from '@ltw/contracts';

import type { StoredGenerationJob, StoredGenerationStep } from './store.ts';

export function generationJobView(job: StoredGenerationJob): CampaignGenerationJob {
  return {
    jobId: job.jobId,
    draftId: job.draftId,
    baseRevision: job.baseRevision,
    status: job.status,
    nextStep: job.nextStep,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    attachedRevision: job.attachedRevision,
    candidateAvailable: job.candidateAvailable,
    failureCode: job.failureCode,
  };
}
export function generationStepView(step: StoredGenerationStep): CampaignGenerationStep {
  return {
    ordinal: step.ordinal,
    stage: step.stage,
    status: step.status,
    traceId: step.traceId,
    content: step.content,
    provider: step.provider,
    model: step.model,
    createdAt: step.createdAt,
    completedAt: step.completedAt,
  };
}
