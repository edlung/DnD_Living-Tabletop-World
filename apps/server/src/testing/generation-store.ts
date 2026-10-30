import { createHash, randomUUID } from 'node:crypto';

import {
  CAMPAIGN_GENERATION_STAGES,
  campaignPackageSchema,
  type CampaignGenerationCandidate,
} from '@ltw/contracts';

import { campaignCanonicalJson } from '../workshop/packages/content.ts';
import type { CampaignRevisionRepository } from '../workshop/packages/store.ts';
import { generationJobView, generationStepProgress } from '../workshop/generation/views.ts';
import type {
  CampaignGenerationRepository,
  EnqueueGeneration,
  GenerationScope,
  GenerationJobScope,
  GenerationLease,
  GenerationStepInput,
  StoredGenerationJob,
  StoredGenerationStep,
} from '../workshop/generation/store.ts';
import type { MemoryWorkshopStore } from './workshop-store.ts';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
const clone = <T>(value: T): T => structuredClone(value);
const digest = (value: unknown) =>
  `sha256:${createHash('sha256').update(campaignCanonicalJson(value)).digest('hex')}`;
const key = (scope: GenerationJobScope) => `${scope.ownerId}/${scope.draftId}/${scope.jobId}`;

/** Test-only reference implementation. All mutations serialize, including final attachment. */
export class MemoryCampaignGenerationRepository implements CampaignGenerationRepository {
  readonly #jobs = new Map<string, Mutable<StoredGenerationJob>>();
  readonly #steps = new Map<string, Map<number, Mutable<StoredGenerationStep>>>();
  readonly #candidates = new Map<string, CampaignGenerationCandidate>();
  readonly #nonces = new Map<string, { fingerprint: string; scope: GenerationJobScope }>();
  readonly #workshop: MemoryWorkshopStore;
  readonly #revisions: CampaignRevisionRepository;
  readonly #now: () => number;
  #tail: Promise<void> = Promise.resolve();
  constructor(
    workshop: MemoryWorkshopStore,
    revisions: CampaignRevisionRepository,
    now = Date.now,
  ) {
    this.#workshop = workshop;
    this.#revisions = revisions;
    this.#now = now;
  }
  async #atomic<T>(work: () => T | Promise<T>): Promise<T> {
    const before = this.#tail;
    let unlock: () => void = () => undefined;
    this.#tail = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    await before;
    try {
      return await work();
    } finally {
      unlock();
    }
  }
  #required(scope: GenerationJobScope) {
    const job = this.#jobs.get(key(scope));
    if (!job) throw new Error('TEST_GENERATION_JOB_MISSING');
    return job;
  }
  #time() {
    return new Date(this.#now()).toISOString();
  }
  #active(ownerId: string, sessionId: string) {
    return [...this.#workshop.sessions.values()].some(
      (session) =>
        session.ownerId === ownerId &&
        session.sessionId === sessionId &&
        session.revokedAt === null &&
        session.createdAt <= this.#time() &&
        session.expiresAt > this.#time(),
    );
  }
  #leased(lease: GenerationLease) {
    const job = this.#jobs.get(key(lease));
    return job &&
      job.status === 'RUNNING' &&
      job.fence === lease.fence &&
      job.workerId === lease.workerId &&
      job.authSessionId === lease.authSessionId &&
      (job.leaseUntil ?? '') > this.#time() &&
      this.#active(job.ownerId, job.authSessionId)
      ? job
      : null;
  }
  enqueue(input: EnqueueGeneration) {
    return this.#atomic(async () => {
      if (
        !(await this.#workshop.draft(input.ownerId, input.draftId)) ||
        !this.#active(input.ownerId, input.authSessionId)
      )
        return { kind: 'not-found' } as const;
      const fingerprint = digest({ seed: input.seed, base: input.basedOnRevision });
      const nonce = `${input.ownerId}/${input.draftId}/${input.requestId}`;
      const old = this.#nonces.get(nonce);
      if (old)
        return old.fingerprint === fingerprint
          ? ({ kind: 'saved', job: clone(this.#required(old.scope)) } as const)
          : ({ kind: 'conflict' } as const);
      const latest = await this.#revisions.latest(input.ownerId, input.draftId);
      if ((latest?.revision ?? 0) !== input.basedOnRevision) return { kind: 'conflict' } as const;
      const job: Mutable<StoredGenerationJob> = {
        jobId: randomUUID(),
        ownerId: input.ownerId,
        draftId: input.draftId,
        authSessionId: input.authSessionId,
        seed: campaignPackageSchema.parse(input.seed),
        requestId: input.requestId,
        baseRevision: input.basedOnRevision,
        status: 'QUEUED',
        nextStep: 0,
        createdAt: this.#time(),
        updatedAt: this.#time(),
        attachedRevision: null,
        candidateAvailable: false,
        failureCode: null,
        fence: '0',
        workerId: null,
        leaseUntil: null,
        retryOf: null,
      };
      this.#jobs.set(key(job), job);
      this.#steps.set(key(job), new Map());
      this.#nonces.set(nonce, { fingerprint, scope: job });
      return { kind: 'saved', job: clone(job) } as const;
    });
  }
  retry(scope: GenerationJobScope, requestId: string, authSessionId: string) {
    return this.#atomic(async () => {
      const old = this.#jobs.get(key(scope));
      if (!old || !this.#active(scope.ownerId, authSessionId))
        return { kind: 'not-found' } as const;
      const nonce = `${scope.ownerId}/${scope.draftId}/${requestId}`;
      const prior = this.#nonces.get(nonce);
      const fingerprint = digest({ retry: scope.jobId });
      if (prior)
        return prior.fingerprint === fingerprint
          ? ({ kind: 'saved', job: clone(this.#required(prior.scope)) } as const)
          : ({ kind: 'conflict' } as const);
      if (old.status !== 'FAILED') return { kind: 'conflict' } as const;
      const latest = await this.#revisions.latest(scope.ownerId, scope.draftId);
      if ((latest?.revision ?? 0) !== old.baseRevision) return { kind: 'conflict' } as const;
      const job: Mutable<StoredGenerationJob> = {
        ...clone(old),
        jobId: randomUUID(),
        authSessionId,
        requestId,
        status: 'QUEUED',
        fence: '0',
        workerId: null,
        leaseUntil: null,
        retryOf: old.jobId,
        failureCode: null,
        createdAt: this.#time(),
        updatedAt: this.#time(),
      };
      this.#jobs.set(key(job), job);
      const completed = [...(this.#steps.get(key(old))?.entries() ?? [])].filter(
        ([, step]) => step.status === 'SUCCEEDED',
      );
      this.#steps.set(key(job), new Map(clone(completed)));
      this.#nonces.set(nonce, { fingerprint, scope: job });
      return { kind: 'saved', job: clone(job) } as const;
    });
  }
  progress(scope: GenerationJobScope) {
    const job = this.#jobs.get(key(scope));
    if (!job) return Promise.resolve(null);
    const candidate = this.#candidates.get(key(scope));
    return Promise.resolve(
      clone({
        job: generationJobView(job),
        brief: job.seed.brief,
        steps: [...(this.#steps.get(key(scope))?.values() ?? [])]
          .sort((a, b) => a.ordinal - b.ordinal)
          .map(generationStepProgress),
        candidate: candidate
          ? {
              contentDigest: candidate.contentDigest,
              baseRevision: candidate.baseRevision,
              createdAt: candidate.createdAt,
            }
          : null,
      }),
    );
  }
  get(scope: GenerationJobScope) {
    return Promise.resolve(clone(this.#jobs.get(key(scope)) ?? null));
  }
  list(
    scope: GenerationScope,
    limit: number,
    before?: Pick<StoredGenerationJob, 'createdAt' | 'jobId'> | null,
  ) {
    return Promise.resolve(
      [...this.#jobs.values()]
        .filter((job) => job.ownerId === scope.ownerId && job.draftId === scope.draftId)
        .filter(
          (job) =>
            !before ||
            job.createdAt < before.createdAt ||
            (job.createdAt === before.createdAt && job.jobId < before.jobId),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.jobId.localeCompare(a.jobId))
        .slice(0, limit)
        .map(generationJobView),
    );
  }
  pending(limit: number) {
    return Promise.resolve(
      [...this.#jobs.values()]
        .filter(
          (job) =>
            job.status === 'QUEUED' ||
            (job.status === 'RUNNING' && (job.leaseUntil ?? '') <= this.#time()),
        )
        .slice(0, limit)
        .map(({ ownerId, draftId, jobId }) => ({ ownerId, draftId, jobId })),
    );
  }
  steps(scope: GenerationJobScope) {
    return Promise.resolve(
      clone(
        [...(this.#steps.get(key(scope))?.values() ?? [])].sort((a, b) => a.ordinal - b.ordinal),
      ),
    );
  }
  candidate(scope: GenerationJobScope) {
    return Promise.resolve(clone(this.#candidates.get(key(scope)) ?? null));
  }
  claim(scope: GenerationJobScope, workerId: string) {
    return this.#atomic(() => {
      const job = this.#jobs.get(key(scope));
      if (
        !job ||
        !this.#active(job.ownerId, job.authSessionId) ||
        !(
          job.status === 'QUEUED' ||
          (job.status === 'RUNNING' && (job.leaseUntil ?? '') <= this.#time())
        )
      )
        return { kind: 'unavailable' } as const;
      if (
        [...(this.#steps.get(key(scope))?.values() ?? [])].some(
          (step) => step.status === 'DISPATCHING',
        )
      ) {
        job.status = 'DISPATCH_UNKNOWN';
        job.failureCode = 'DISPATCH_UNKNOWN';
        job.fence = String(BigInt(job.fence) + 1n);
        return { kind: 'unavailable' } as const;
      }
      job.status = 'RUNNING';
      job.workerId = workerId;
      job.fence = String(BigInt(job.fence) + 1n);
      job.leaseUntil = new Date(this.#now() + 30_000).toISOString();
      job.updatedAt = this.#time();
      return {
        kind: 'claimed',
        job: clone(job),
        lease: { ...scope, workerId, fence: job.fence, authSessionId: job.authSessionId },
      } as const;
    });
  }
  renew(lease: GenerationLease) {
    return this.#atomic(() => {
      const job = this.#leased(lease);
      if (!job) return { kind: 'fenced' } as const;
      job.leaseUntil = new Date(this.#now() + 30_000).toISOString();
      return { kind: 'saved', job: clone(job) } as const;
    });
  }
  cancel(scope: GenerationJobScope) {
    return this.#atomic(() => {
      const job = this.#jobs.get(key(scope));
      if (!job) return { kind: 'not-found' } as const;
      if (job.status === 'SUCCEEDED') return { kind: 'conflict' } as const;
      job.status = 'CANCELLED';
      job.fence = String(BigInt(job.fence) + 1n);
      job.updatedAt = this.#time();
      job.leaseUntil = null;
      return { kind: 'saved', job: clone(job) } as const;
    });
  }
  prepareStep(lease: GenerationLease, input: GenerationStepInput) {
    return this.#atomic(() => {
      const job = this.#leased(lease);
      if (!job) return { kind: 'fenced' } as const;
      if (input.ordinal !== job.nextStep) return { kind: 'conflict' } as const;
      const steps = this.#steps.get(key(lease));
      if (!steps) return { kind: 'conflict' } as const;
      const old = steps.get(input.ordinal);
      const fingerprint = digest(input);
      if (old)
        return old.inputDigest === fingerprint
          ? ({ kind: 'prepared', step: clone(old) } as const)
          : ({ kind: 'conflict' } as const);
      const prior = input.ordinal === 0 ? job.seed : steps.get(input.ordinal - 1)?.content;
      if (!prior || digest(prior) !== digest(input.input)) return { kind: 'conflict' } as const;
      const stage = CAMPAIGN_GENERATION_STAGES[input.ordinal];
      if (!stage) return { kind: 'conflict' } as const;
      const step: Mutable<StoredGenerationStep> = {
        ...clone(input),
        stage,
        status: 'PREPARED',
        inputDigest: fingerprint,
        content: null,
        providerRequestId: null,
        createdAt: this.#time(),
        completedAt: null,
      };
      steps.set(input.ordinal, step);
      return { kind: 'prepared', step: clone(step) } as const;
    });
  }
  beginDispatch(lease: GenerationLease, ordinal: number) {
    return this.#atomic(() => {
      const job = this.#leased(lease);
      if (!job) return { kind: 'fenced' } as const;
      const step = this.#steps.get(key(lease))?.get(ordinal);
      if (!step) return { kind: 'fenced' } as const;
      if (step.status === 'SUCCEEDED') return { kind: 'stored', step: clone(step) } as const;
      if (step.status === 'DISPATCHING') return { kind: 'uncertain' } as const;
      step.status = 'DISPATCHING';
      return { kind: 'dispatch', step: clone(step) } as const;
    });
  }
  completeStep(
    lease: GenerationLease,
    ordinal: number,
    result: { content: StoredGenerationStep['input']; providerRequestId: string | null },
  ) {
    return this.#atomic(() => {
      const job = this.#leased(lease);
      if (!job) return { kind: 'fenced' } as const;
      const step = this.#steps.get(key(lease))?.get(ordinal);
      if (!step) return { kind: 'conflict' } as const;
      if (step.content)
        return digest(step.content) === digest(result.content)
          ? ({ kind: 'stored', step: clone(step) } as const)
          : ({ kind: 'conflict' } as const);
      if (step.status !== 'DISPATCHING' || job.nextStep !== ordinal)
        return { kind: 'conflict' } as const;
      step.content = campaignPackageSchema.parse(result.content);
      step.status = 'SUCCEEDED';
      step.completedAt = this.#time();
      step.providerRequestId = result.providerRequestId;
      job.nextStep = ordinal + 1;
      job.updatedAt = this.#time();
      return { kind: 'stored', step: clone(step) } as const;
    });
  }
  fail(lease: GenerationLease, code: string, dispatchUnknown = false) {
    return this.#atomic(() => {
      const job = this.#leased(lease);
      if (!job) return { kind: 'fenced' } as const;
      if (
        dispatchUnknown &&
        ![...(this.#steps.get(key(lease))?.values() ?? [])].some(
          (step) => step.status === 'DISPATCHING',
        )
      )
        return { kind: 'saved', job: clone(job) } as const;
      job.status = dispatchUnknown ? 'DISPATCH_UNKNOWN' : 'FAILED';
      job.failureCode = code;
      job.leaseUntil = null;
      job.updatedAt = this.#time();
      return { kind: 'saved', job: clone(job) } as const;
    });
  }
  finalize(lease: GenerationLease) {
    return this.#atomic(async () => {
      const job = this.#leased(lease);
      if (!job) return { kind: 'fenced' } as const;
      const last = this.#steps.get(key(lease))?.get(CAMPAIGN_GENERATION_STAGES.length - 1);
      if (
        job.nextStep !== CAMPAIGN_GENERATION_STAGES.length ||
        !last?.content ||
        !last.provider ||
        !last.model
      )
        return { kind: 'incomplete' } as const;
      const candidate = this.#candidates.get(key(lease)) ?? {
        jobId: job.jobId,
        draftId: job.draftId,
        baseRevision: job.baseRevision,
        content: clone(last.content),
        contentDigest: digest(last.content),
        source: {
          kind: 'AI',
          jobId: job.jobId,
          traceId: last.traceId,
          provider: last.provider,
          model: last.model,
        } as const,
        createdAt: this.#time(),
      };
      this.#candidates.set(key(lease), candidate);
      const result = await this.#revisions.append({
        ownerId: job.ownerId,
        draftId: job.draftId,
        requestId: job.jobId,
        basedOnRevision: job.baseRevision,
        content: candidate.content,
        source: candidate.source,
        createdAt: candidate.createdAt,
      });
      job.status = 'SUCCEEDED';
      job.candidateAvailable = true;
      job.leaseUntil = null;
      job.updatedAt = this.#time();
      if (result.kind !== 'saved')
        return { kind: 'candidate', candidate: clone(candidate) } as const;
      job.attachedRevision = result.revision.revision;
      return { kind: 'attached', revision: result.revision, candidate: clone(candidate) } as const;
    });
  }
}
