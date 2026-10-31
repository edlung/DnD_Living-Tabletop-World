import { randomUUID } from 'node:crypto';

import {
  CAMPAIGN_GENERATION_STAGES,
  campaignPackageSchema,
  type CampaignRevision,
  type DraftLockSnapshot,
  type DraftVisualManifest,
} from '@ltw/contracts';

import type { MemoryCampaignRevisionRepository } from './campaign-packages.ts';
import { checkedJobInput, jobFingerprint } from '../workshop/generation/postgres-enqueue.ts';
import { ownersInTurn, roomForTextJob } from '../workshop/job-limits.ts';
import {
  clone,
  digest,
  generationKey as key,
  generationState,
  generationAtomic,
  type Mutable,
} from './generation-state.ts';
import { generationJobView, generationStepProgress } from '../workshop/generation/views.ts';
import type {
  CampaignGenerationRepository,
  EnqueueGeneration,
  EnqueueEdit,
  GenerationMode,
  GenerationScope,
  GenerationJobScope,
  GenerationLease,
  GenerationStepInput,
  StoredGenerationJob,
  StoredGenerationStep,
} from '../workshop/generation/store.ts';
import { finalizeMemoryGeneration } from './generation-finalize.ts';
import type { MemoryWorkshopStore } from './workshop-store.ts';

export interface MemoryGenerationControls {
  locksWithinDraftLock(scope: GenerationScope, head: CampaignRevision): DraftLockSnapshot;
  manifest(scope: GenerationScope, revision: number): DraftVisualManifest | null;
}
/** Test-only reference implementation. All mutations serialize, including final attachment. */
export class MemoryCampaignGenerationRepository implements CampaignGenerationRepository {
  readonly mode: GenerationMode;
  readonly #state;
  readonly #jobs;
  readonly #steps;
  readonly #candidates;
  readonly #nonces;
  #controls: MemoryGenerationControls | undefined;
  readonly #workshop: MemoryWorkshopStore;
  readonly #revisions: MemoryCampaignRevisionRepository;
  readonly #now: () => number;
  constructor(
    workshop: MemoryWorkshopStore,
    revisions: MemoryCampaignRevisionRepository,
    now = Date.now,
    mode: GenerationMode = 'GENERATE',
    controls?: MemoryGenerationControls,
  ) {
    this.#state = generationState(workshop);
    this.#jobs = this.#state.jobs;
    this.#steps = this.#state.steps;
    this.#candidates = this.#state.candidates;
    this.#nonces = this.#state.nonces;
    this.#controls = controls;
    this.mode = mode;
    this.#workshop = workshop;
    this.#revisions = revisions;
    this.#now = now;
  }
  configureControls(controls: MemoryGenerationControls) {
    this.#controls = controls;
  }
  #atomic<T>(work: () => T | Promise<T>): Promise<T> {
    return generationAtomic(this.#state, work);
  }
  #job(scope: GenerationJobScope) {
    const job = this.#jobs.get(key(scope));
    return job?.mode === this.mode ? job : undefined;
  }
  async #current(input: ReturnType<typeof checkedJobInput>) {
    const head = await this.#revisions.latest(input.ownerId, input.draftId);
    if ((head?.revision ?? 0) !== input.basedOnRevision) return null;
    const locks = head ? this.#controls?.locksWithinDraftLock(input, head) : null;
    const current = locks?.version ?? 0;
    if (input.mode === 'GENERATE')
      return input.lockVersion === undefined || input.lockVersion === current ? current : null;
    if (current !== (input.lockVersion ?? 0)) return null;
    const spec = input.editSpec;
    const manifest = head ? this.#controls?.manifest(input, head.revision) : null;
    return head &&
      locks &&
      manifest &&
      spec &&
      head.digest === spec.baselineDigest &&
      digest(head.content) === digest(input.seed) &&
      locks.digest === spec.lockSnapshot.digest &&
      manifest.version === spec.manifestVersion &&
      manifest.digest === spec.manifestDigest
      ? current
      : null;
  }
  #required(scope: GenerationJobScope) {
    const job = this.#job(scope);
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
    const job = this.#job(lease);
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
  enqueue(raw: EnqueueGeneration) {
    if (this.mode !== 'GENERATE') return Promise.resolve({ kind: 'conflict' } as const);
    return this.#enqueue(raw);
  }
  enqueueEdit(raw: EnqueueEdit) {
    if (this.mode !== 'EDIT') return Promise.resolve({ kind: 'conflict' } as const);
    return this.#enqueue(raw);
  }
  #enqueue(raw: EnqueueGeneration | EnqueueEdit) {
    const input = checkedJobInput(raw, this.mode);
    return this.#revisions.withDraftLock(input, () =>
      this.#atomic(async () => {
        if (
          !(await this.#workshop.draft(input.ownerId, input.draftId)) ||
          !this.#active(input.ownerId, input.authSessionId)
        )
          return { kind: 'not-found' } as const;
        const fingerprint = jobFingerprint(input, null);
        const nonce = `${input.ownerId}/${input.draftId}/${input.requestId}`;
        const old = this.#nonces.get(nonce);
        if (old)
          return old.fingerprint === fingerprint && this.#required(old.scope).mode === this.mode
            ? ({ kind: 'saved', job: clone(this.#required(old.scope)) } as const)
            : ({ kind: 'conflict' } as const);
        const capturedLockVersion = await this.#current(input);
        if (capturedLockVersion === null) return { kind: 'conflict' } as const;
        if (!roomForTextJob(this.#jobs.values(), input)) return { kind: 'busy' } as const;
        const job: Mutable<StoredGenerationJob> = {
          mode: this.mode,
          lockVersion: capturedLockVersion,
          editSpec: input.editSpec,
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
      }),
    );
  }
  retry(scope: GenerationJobScope, requestId: string, authSessionId: string) {
    return this.#revisions.withDraftLock(scope, () =>
      this.#atomic(async () => {
        const old = this.#job(scope);
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
        const context = checkedJobInput(
          {
            ownerId: old.ownerId,
            draftId: old.draftId,
            authSessionId,
            requestId,
            basedOnRevision: old.baseRevision,
            seed: old.seed,
            lockVersion: old.lockVersion,
            ...(old.editSpec ? { editSpec: old.editSpec } : {}),
          },
          this.mode,
        );
        if ((await this.#current(context)) === null) return { kind: 'conflict' } as const;
        if (!roomForTextJob(this.#jobs.values(), old)) return { kind: 'busy' } as const;
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
      }),
    );
  }
  progress(scope: GenerationJobScope) {
    const job = this.#job(scope);
    if (!job) return Promise.resolve(null);
    const candidate = this.#candidates.get(key(scope));
    return Promise.resolve(
      clone({
        ...(job.mode === 'EDIT' && job.editSpec
          ? {
              edit: {
                instruction: job.editSpec.instruction,
                requestedTargets: job.editSpec.requestedTargets,
              },
            }
          : {}),
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
  requestById(scope: GenerationScope, requestId: string) {
    const nonce = this.#nonces.get(`${scope.ownerId}/${scope.draftId}/${requestId}`);
    return Promise.resolve(clone(nonce ? (this.#job(nonce.scope) ?? null) : null));
  }
  get(scope: GenerationJobScope) {
    return Promise.resolve(clone(this.#job(scope) ?? null));
  }
  list(
    scope: GenerationScope,
    limit: number,
    before?: Pick<StoredGenerationJob, 'createdAt' | 'jobId'> | null,
  ) {
    return Promise.resolve(
      [...this.#jobs.values()]
        .filter((job) => job.mode === this.mode)
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
      ownersInTurn(
        [...this.#jobs.values()]
          .filter((job) => job.mode === this.mode)
          .filter(
            (job) =>
              job.status === 'QUEUED' ||
              (job.status === 'RUNNING' && (job.leaseUntil ?? '') <= this.#time()),
          ),
      )
        .slice(0, limit)
        .map(({ ownerId, draftId, jobId }) => ({ ownerId, draftId, jobId })),
    );
  }
  steps(scope: GenerationJobScope) {
    return Promise.resolve(
      clone(
        [...(this.#job(scope) ? (this.#steps.get(key(scope))?.values() ?? []) : [])].sort(
          (a, b) => a.ordinal - b.ordinal,
        ),
      ),
    );
  }
  candidate(scope: GenerationJobScope) {
    return Promise.resolve(
      clone(this.#job(scope) ? (this.#candidates.get(key(scope)) ?? null) : null),
    );
  }
  claim(scope: GenerationJobScope, workerId: string) {
    return this.#atomic(() => {
      const job = this.#job(scope);
      if (
        !job ||
        !(
          job.status === 'QUEUED' ||
          (job.status === 'RUNNING' && (job.leaseUntil ?? '') <= this.#time())
        )
      )
        return { kind: 'unavailable' } as const;
      const uncertain = [...(this.#steps.get(key(scope))?.values() ?? [])].some(
        (step) => step.status === 'DISPATCHING',
      );
      if (uncertain || !this.#active(job.ownerId, job.authSessionId)) {
        job.status = uncertain ? 'DISPATCH_UNKNOWN' : 'CANCELLED';
        job.failureCode = uncertain ? 'DISPATCH_UNKNOWN' : 'AUTH_SESSION_ENDED';
        job.fence = String(BigInt(job.fence) + 1n);
        job.leaseUntil = null;
        job.updatedAt = this.#time();
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
        lease: {
          ...scope,
          mode: this.mode,
          workerId,
          fence: job.fence,
          authSessionId: job.authSessionId,
        },
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
      const job = this.#job(scope);
      if (!job) return { kind: 'not-found' } as const;
      if (job.status === 'CANCELLED') return { kind: 'saved', job: clone(job) } as const;
      if (job.status !== 'QUEUED' && job.status !== 'RUNNING') return { kind: 'conflict' } as const;
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
      const stage =
        this.mode === 'EDIT'
          ? input.ordinal === 0
            ? 'edit'
            : undefined
          : CAMPAIGN_GENERATION_STAGES[input.ordinal];
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
      job.fence = String(BigInt(job.fence) + 1n);
      job.failureCode = code;
      job.leaseUntil = null;
      job.updatedAt = this.#time();
      return { kind: 'saved', job: clone(job) } as const;
    });
  }
  finalize(lease: GenerationLease) {
    return this.#revisions.withDraftLock(lease, () =>
      this.#atomic(() =>
        finalizeMemoryGeneration({
          state: this.#state,
          revisions: this.#revisions,
          lease,
          mode: this.mode,
          time: () => this.#time(),
          active: () => this.#leased(lease),
        }),
      ),
    );
  }
}
