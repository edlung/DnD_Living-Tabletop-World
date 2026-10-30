import { CAMPAIGN_GENERATION_STAGES } from '@ltw/contracts';

import type {
  CampaignGenerationRepository,
  GenerationLease,
  GenerationMode,
  StoredGenerationJob,
} from '../workshop/generation/store.ts';
import type { MemoryCampaignRevisionRepository } from './campaign-packages.ts';
import {
  clone,
  digest,
  generationKey as key,
  type generationState,
  type Mutable,
} from './generation-state.ts';

/** Called inside the shared draft lock and generation state transaction. */
export async function finalizeMemoryGeneration(input: {
  state: ReturnType<typeof generationState>;
  revisions: MemoryCampaignRevisionRepository;
  lease: GenerationLease;
  mode: GenerationMode;
  time: () => string;
  active: () => Mutable<StoredGenerationJob> | null | undefined;
}): ReturnType<CampaignGenerationRepository['finalize']> {
  const { state, revisions, lease, mode, time } = input;
  const stored = state.jobs.get(key(lease));
  if (
    stored?.mode === mode &&
    stored.status === 'SUCCEEDED' &&
    stored.fence === lease.fence &&
    stored.workerId === lease.workerId &&
    stored.authSessionId === lease.authSessionId
  ) {
    const candidate = state.candidates.get(key(lease));
    if (!candidate) throw new Error('CANDIDATE_NOT_STORED');
    if (stored.attachedRevision === null) return { kind: 'candidate', candidate: clone(candidate) };
    const revision = await revisions.get(lease.ownerId, lease.draftId, stored.attachedRevision);
    if (!revision) throw new Error('ATTACHED_REVISION_NOT_STORED');
    return { kind: 'attached', revision, candidate: clone(candidate) };
  }
  const job = input.active();
  if (!job) return { kind: 'fenced' };
  const count = mode === 'EDIT' ? 1 : CAMPAIGN_GENERATION_STAGES.length;
  const last = state.steps.get(key(lease))?.get(count - 1);
  if (job.nextStep !== count || !last?.content || !last.provider || !last.model)
    return { kind: 'incomplete' };
  const candidate = state.candidates.get(key(lease)) ?? {
    jobId: job.jobId,
    draftId: job.draftId,
    baseRevision: job.baseRevision,
    content: clone(last.content),
    contentDigest: digest(last.content),
    source: {
      kind: 'AI' as const,
      jobId: job.jobId,
      traceId: last.traceId,
      provider: last.provider,
      model: last.model,
    },
    createdAt: time(),
  };
  const result =
    mode === 'EDIT'
      ? null
      : revisions.appendWithinDraftLock({
          ownerId: job.ownerId,
          draftId: job.draftId,
          requestId: job.jobId,
          basedOnRevision: job.baseRevision,
          expectedLockVersion: job.lockVersion,
          content: candidate.content,
          source: candidate.source,
          createdAt: candidate.createdAt,
        });
  state.candidates.set(key(lease), candidate);
  job.status = 'SUCCEEDED';
  job.candidateAvailable = true;
  job.leaseUntil = null;
  job.updatedAt = time();
  if (result?.kind !== 'saved') return { kind: 'candidate', candidate: clone(candidate) };
  job.attachedRevision = result.revision.revision;
  return { kind: 'attached', revision: result.revision, candidate: clone(candidate) };
}
