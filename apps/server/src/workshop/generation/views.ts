import type {
  CampaignGenerationJob,
  CampaignGenerationStep,
  CampaignGenerationProgressStep,
} from '@ltw/contracts';

import type { StoredGenerationJob, StoredGenerationStep } from './store.ts';

export function generationJobView(job: StoredGenerationJob): CampaignGenerationJob {
  return {
    ...(job.mode === 'EDIT' ? { mode: 'EDIT' as const } : {}),
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
export function generationStepProgress(step: StoredGenerationStep): CampaignGenerationProgressStep {
  return {
    ordinal: step.ordinal,
    stage: step.stage,
    status: step.status,
    traceId: step.traceId,
    provider: step.provider,
    model: step.model,
    createdAt: step.createdAt,
    completedAt: step.completedAt,
  };
}

export function generationStepView(step: StoredGenerationStep): CampaignGenerationStep {
  return { ...generationStepProgress(step), content: step.content };
}
