import { randomUUID } from 'node:crypto';

import {
  selectDraftImageSchema,
  type DraftImageCandidate,
  type DraftImageJob,
  type DraftVisualManifest,
  type DraftVisualEntry,
  type CampaignRevision,
} from '@ltw/contracts';

import { checkContent, contentHashOf } from '../assets/content-store.ts';
import { publicDraftImageJob } from '../workshop/images/views.ts';
import {
  imageDigest,
  imageSlotKey,
  newVisualManifest,
  draftImageSourceSignature,
} from '../workshop/images/manifest.ts';
import {
  checkedImageRequest,
  imageRequestFingerprint,
  preparedImageMatches,
  selectedReference,
} from '../workshop/images/requests.ts';
import type {
  DraftImageRepository,
  DraftImageScope,
  DraftImageJobScope,
  DraftImageLease,
  StoredDraftImageJob,
  RequestDraftImage,
  SelectDraftImage,
} from '../workshop/images/store.ts';
import type { MemoryCampaignRevisionRepository } from './campaign-packages.ts';
import type { MemoryWorkshopStore } from './workshop-store.ts';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
const copy = <T>(value: T): T => structuredClone(value);
const scopeKey = (scope: DraftImageScope) => `${scope.ownerId}/${scope.draftId}`;
const jobKey = (scope: DraftImageJobScope) => `${scopeKey(scope)}/${scope.jobId}`;
export class MemoryDraftImageRepository implements DraftImageRepository {
  readonly #workshop: MemoryWorkshopStore;
  readonly #revisions: MemoryCampaignRevisionRepository;
  readonly #now: () => number;
  readonly #jobs = new Map<string, Mutable<StoredDraftImageJob>>();
  readonly #nonces = new Map<string, { fingerprint: string; jobKey: string }>();
  readonly #markers = new Set<string>();
  readonly #candidates = new Map<string, DraftImageCandidate>();
  readonly #bytes = new Map<
    string,
    { bytes: Uint8Array; mediaType: DraftImageCandidate['mediaType'] }
  >();
  readonly #manifests = new Map<string, DraftVisualManifest[]>();
  readonly #selectionNonces = new Map<
    string,
    { fingerprint: string; manifest: DraftVisualManifest }
  >();
  readonly #selectionGuards = new Set<
    (scope: DraftImageScope, revision: CampaignRevision, manifest: DraftVisualManifest) => boolean
  >();
  registerSelectionGuard(
    guard: (
      scope: DraftImageScope,
      revision: CampaignRevision,
      manifest: DraftVisualManifest,
    ) => boolean,
  ) {
    this.#selectionGuards.add(guard);
  }
  snapshotManifest(scope: DraftImageScope, revision: number): DraftVisualManifest | null {
    return copy(this.#manifests.get(`${scopeKey(scope)}/${revision}`)?.at(-1) ?? null);
  }
  #tail: Promise<void> = Promise.resolve();
  constructor(
    workshop: MemoryWorkshopStore,
    revisions: MemoryCampaignRevisionRepository,
    now = Date.now,
  ) {
    this.#workshop = workshop;
    this.#revisions = revisions;
    this.#now = now;
    revisions.registerAppendHook((ownerId, revision) => {
      const scope = { ownerId, draftId: revision.draftId };
      const parent = this.#manifests.get(`${scopeKey(scope)}/${revision.basedOnRevision}`)?.at(-1);
      const manifest = newVisualManifest(revision, 0, parent?.entries ?? [], this.#time());
      return () => {
        this.#manifests.set(`${scopeKey(scope)}/${revision.revision}`, [manifest]);
      };
    });
  }
  async #atomic<T>(work: () => T | Promise<T>): Promise<T> {
    const old = this.#tail;
    let release: () => void = () => undefined;
    this.#tail = new Promise((resolve) => {
      release = resolve;
    });
    await old;
    try {
      return await work();
    } finally {
      release();
    }
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
  #lease(lease: DraftImageLease) {
    const row = this.#jobs.get(jobKey(lease));
    return row &&
      row.status === 'RUNNING' &&
      row.fence === lease.fence &&
      row.workerId === lease.workerId &&
      row.chargeId === lease.chargeId &&
      row.authSessionId === lease.authSessionId &&
      (row.leaseUntil ?? '') > this.#time() &&
      this.#active(row.ownerId, row.authSessionId)
      ? row
      : null;
  }
  #ensure(scope: DraftImageScope, revision: CampaignRevision) {
    const key = `${scopeKey(scope)}/${revision.revision}`;
    let versions = this.#manifests.get(key);
    if (!versions) {
      versions = [newVisualManifest(revision, 0, [], this.#time())];
      this.#manifests.set(key, versions);
    }
    const last = versions.at(-1);
    if (!last) throw new Error('TEST_MANIFEST_MISSING');
    return last;
  }
  #public(job: StoredDraftImageJob): DraftImageJob {
    return publicDraftImageJob(job);
  }
  request(raw: RequestDraftImage) {
    const input = checkedImageRequest(raw);
    return this.#atomic(async () => {
      if (!(await this.#workshop.draft(input.ownerId, input.draftId)))
        return { kind: 'not-found' } as const;
      if (!this.#active(input.ownerId, input.authSessionId)) return { kind: 'conflict' } as const;
      const nonce = `${scopeKey(input)}/${input.requestId}`,
        fingerprint = imageRequestFingerprint(input);
      const prior = this.#nonces.get(nonce);
      if (prior) {
        const job = this.#jobs.get(prior.jobKey);
        if (!job) throw new Error('TEST_IMAGE_JOB_MISSING');
        return prior.fingerprint === fingerprint
          ? ({ kind: 'saved', job: copy(job) } as const)
          : ({ kind: 'conflict' } as const);
      }
      const revision = await this.#revisions.get(input.ownerId, input.draftId, input.revision);
      if (!revision) return { kind: 'not-found' } as const;
      const manifest = this.#ensure(input, revision);
      if (
        revision.digest !== input.packageDigest ||
        manifest.version !== input.expectedManifestVersion ||
        !preparedImageMatches(input, revision, manifest)
      )
        return { kind: 'conflict' } as const;
      const job: Mutable<StoredDraftImageJob> = {
        requestId: input.requestId,
        expectedManifestVersion: input.expectedManifestVersion,
        jobId: randomUUID(),
        ownerId: input.ownerId,
        draftId: input.draftId,
        authSessionId: input.authSessionId,
        revision: input.revision,
        entityId: input.input.subject.entityId,
        purpose: input.input.purpose,
        variant: input.input.variant,
        label: input.input.label,
        input: copy(input.input),
        packageDigest: input.packageDigest,
        sourceSignature: input.sourceSignature,
        provider: input.provider,
        model: input.model,
        requestDigest: input.requestDigest,
        status: 'QUEUED',
        fence: '0',
        workerId: null,
        leaseUntil: null,
        chargeId: null,
        failureCode: null,
        createdAt: this.#time(),
        updatedAt: this.#time(),
      };
      const key = jobKey(job);
      this.#jobs.set(key, job);
      this.#nonces.set(nonce, { fingerprint, jobKey: key });
      return { kind: 'saved', job: copy(job) } as const;
    });
  }
  get(scope: DraftImageJobScope) {
    return Promise.resolve(copy(this.#jobs.get(jobKey(scope)) ?? null));
  }
  requestById(scope: DraftImageScope, requestId: string) {
    const nonce = this.#nonces.get(`${scopeKey(scope)}/${requestId}`);
    return Promise.resolve(copy(nonce ? (this.#jobs.get(nonce.jobKey) ?? null) : null));
  }
  list(
    scope: DraftImageScope,
    revision: number,
    limit: number,
    before?: Pick<DraftImageJob, 'createdAt' | 'jobId'> | null,
  ) {
    return Promise.resolve(
      [...this.#jobs.values()]
        .filter(
          (job) =>
            job.ownerId === scope.ownerId &&
            job.draftId === scope.draftId &&
            job.revision === revision,
        )
        .filter(
          (job) =>
            !before ||
            job.createdAt < before.createdAt ||
            (job.createdAt === before.createdAt && job.jobId < before.jobId),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.jobId.localeCompare(a.jobId))
        .slice(0, limit)
        .map((job) => this.#public(job)),
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
  claim(scope: DraftImageJobScope, workerId: string) {
    return this.#atomic(() => {
      const job = this.#jobs.get(jobKey(scope));
      if (
        !job ||
        !['QUEUED', 'RUNNING'].includes(job.status) ||
        (job.status === 'RUNNING' && (job.leaseUntil ?? '') > this.#time())
      )
        return { kind: 'unavailable' } as const;
      if (this.#markers.has(jobKey(scope)) || !this.#active(job.ownerId, job.authSessionId)) {
        job.status = this.#markers.has(jobKey(scope)) ? 'DISPATCH_UNKNOWN' : 'CANCELLED';
        job.failureCode =
          job.status === 'DISPATCH_UNKNOWN' ? 'DISPATCH_UNKNOWN' : 'AUTH_SESSION_ENDED';
        job.fence = String(BigInt(job.fence) + 1n);
        job.leaseUntil = null;
        return { kind: 'unavailable' } as const;
      }
      job.status = 'RUNNING';
      job.workerId = workerId;
      job.fence = String(BigInt(job.fence) + 1n);
      job.chargeId = randomUUID();
      job.leaseUntil = new Date(this.#now() + 30000).toISOString();
      job.updatedAt = this.#time();
      return {
        kind: 'claimed',
        job: copy(job),
        lease: {
          ...scope,
          workerId,
          authSessionId: job.authSessionId,
          fence: job.fence,
          chargeId: job.chargeId,
        },
      } as const;
    });
  }
  renew(lease: DraftImageLease) {
    return this.#atomic(() => {
      const job = this.#lease(lease);
      if (!job) return false;
      job.leaseUntil = new Date(this.#now() + 30000).toISOString();
      return true;
    });
  }
  beginDispatch(lease: DraftImageLease, proof: { chargeId: string; requestDigest: string }) {
    return this.#atomic(() => {
      const stored = this.#jobs.get(jobKey(lease));
      if (
        stored?.requestDigest === proof.requestDigest &&
        stored.chargeId === proof.chargeId &&
        stored.chargeId === lease.chargeId &&
        stored.fence === lease.fence &&
        stored.workerId === lease.workerId &&
        stored.authSessionId === lease.authSessionId &&
        [...this.#candidates.values()].some((candidate) => candidate.jobId === lease.jobId)
      )
        return 'STORED' as const;
      const job = this.#lease(lease);
      if (!job || job.chargeId !== proof.chargeId || job.requestDigest !== proof.requestDigest)
        return 'FENCED' as const;
      if (this.#markers.has(jobKey(lease))) return 'UNKNOWN' as const;
      this.#markers.add(jobKey(lease));
      return 'DISPATCH' as const;
    });
  }
  complete(lease: DraftImageLease, result: Parameters<DraftImageRepository['complete']>[1]) {
    return this.#atomic(() => {
      checkContent(result);
      if (!['image/png', 'image/webp'].includes(result.mediaType))
        throw new Error('DRAFT_IMAGE_RASTER_REQUIRED');
      const raw = this.#jobs.get(jobKey(lease)),
        hash = contentHashOf(result.bytes);
      const old = [...this.#candidates.values()].find(
        (candidate) => candidate.jobId === lease.jobId,
      );
      if (
        old &&
        raw?.fence === lease.fence &&
        raw.workerId === lease.workerId &&
        raw.chargeId === lease.chargeId &&
        raw.authSessionId === lease.authSessionId
      )
        return old.contentHash === hash &&
          old.mediaType === result.mediaType &&
          old.model === result.model
          ? ({ kind: 'stored', candidate: copy(old) } as const)
          : ({ kind: 'conflict' } as const);
      const job = this.#lease(lease);
      if (!job) return { kind: 'fenced' } as const;
      if (!this.#markers.has(jobKey(lease)) || job.model !== result.model)
        return { kind: 'conflict' } as const;
      const candidate: DraftImageCandidate = {
        candidateId: randomUUID(),
        jobId: job.jobId,
        sourceRevision: job.revision,
        entityId: job.entityId,
        purpose: job.purpose,
        variant: job.variant,
        label: job.label,
        contentHash: hash,
        mediaType: result.mediaType,
        sourceSignature: job.sourceSignature,
        referenceHash: job.input.reference?.contentHash ?? null,
        provider: job.provider,
        model: job.model,
        createdAt: this.#time(),
      };
      const existing = this.#bytes.get(`${scopeKey(lease)}/${hash}`);
      if (existing && existing.mediaType !== result.mediaType)
        throw new Error('IMAGE_CONTENT_TYPE_CONFLICT');
      this.#bytes.set(`${scopeKey(lease)}/${hash}`, {
        bytes: result.bytes.slice(),
        mediaType: result.mediaType,
      });
      this.#candidates.set(`${scopeKey(lease)}/${candidate.candidateId}`, candidate);
      job.status = 'SUCCEEDED';
      job.leaseUntil = null;
      job.updatedAt = this.#time();
      return { kind: 'stored', candidate: copy(candidate) } as const;
    });
  }
  fail(lease: DraftImageLease, code: string, uncertain = false) {
    return this.#atomic(() => {
      const job = this.#lease(lease);
      if (!job) return false;
      if (uncertain && !this.#markers.has(jobKey(lease))) return true;
      job.status = uncertain ? 'DISPATCH_UNKNOWN' : 'FAILED';
      job.failureCode = code;
      job.fence = String(BigInt(job.fence) + 1n);
      job.leaseUntil = null;
      return true;
    });
  }
  cancel(scope: DraftImageJobScope) {
    return this.#atomic(() => {
      const job = this.#jobs.get(jobKey(scope));
      if (!job) return { kind: 'not-found' } as const;
      if (job.status === 'CANCELLED') return { kind: 'saved', job: copy(job) } as const;
      if (!['QUEUED', 'RUNNING'].includes(job.status)) return { kind: 'conflict' } as const;
      job.status = 'CANCELLED';
      job.fence = String(BigInt(job.fence) + 1n);
      job.leaseUntil = null;
      return { kind: 'saved', job: copy(job) } as const;
    });
  }
  candidate(scope: DraftImageScope, candidateId: string) {
    return Promise.resolve(copy(this.#candidates.get(`${scopeKey(scope)}/${candidateId}`) ?? null));
  }
  candidates(
    scope: DraftImageScope,
    revision: number,
    limit: number,
    before?: Pick<DraftImageCandidate, 'createdAt' | 'candidateId'> | null,
    entityId?: string,
  ) {
    return Promise.resolve(
      [...this.#candidates.entries()]
        .filter(
          ([key, c]) =>
            key.startsWith(`${scopeKey(scope)}/`) &&
            c.sourceRevision === revision &&
            (!entityId || c.entityId === entityId),
        )
        .map(([, c]) => c)
        .filter(
          (c) =>
            !before ||
            c.createdAt < before.createdAt ||
            (c.createdAt === before.createdAt && c.candidateId < before.candidateId),
        )
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || b.candidateId.localeCompare(a.candidateId),
        )
        .slice(0, limit)
        .map(copy),
    );
  }
  manifest(scope: DraftImageScope, revision: number) {
    return this.#atomic(async () => {
      const stored = await this.#revisions.get(scope.ownerId, scope.draftId, revision);
      return stored ? copy(this.#ensure(scope, stored)) : null;
    });
  }
  select(input: SelectDraftImage) {
    return this.#revisions.withDraftLock(input, () =>
      this.#atomic(async () => {
        const { ownerId, draftId, authSessionId, ...body } = input;
        const parsed = selectDraftImageSchema.parse(body),
          fingerprint = imageDigest(parsed);
        if (!(await this.#workshop.draft(ownerId, draftId))) return { kind: 'not-found' } as const;
        if (!this.#active(ownerId, authSessionId)) return { kind: 'conflict' } as const;
        const nonce = `${scopeKey(input)}/${input.requestId}`,
          old = this.#selectionNonces.get(nonce);
        if (old)
          return old.fingerprint === fingerprint
            ? ({ kind: 'saved', manifest: copy(old.manifest) } as const)
            : ({ kind: 'conflict' } as const);
        const revision = await this.#revisions.get(ownerId, draftId, input.revision);
        if (!revision) return { kind: 'not-found' } as const;
        const manifest = this.#ensure(input, revision);
        if (
          revision.digest !== input.packageDigest ||
          manifest.version !== input.expectedManifestVersion
        )
          return { kind: 'conflict' } as const;
        const entries = manifest.entries.filter(
          (entry) => imageSlotKey(entry) !== imageSlotKey(input),
        );
        if (input.candidateId !== null) {
          const candidate = this.#candidates.get(`${scopeKey(input)}/${input.candidateId}`);
          if (!candidate || imageSlotKey(candidate) !== imageSlotKey(input))
            return { kind: 'conflict' } as const;
          const referenceHash =
            input.variant === 'reference'
              ? null
              : (selectedReference(manifest, input.entityId)?.contentHash ?? null);
          if (
            candidate.referenceHash !== referenceHash ||
            candidate.sourceSignature !== draftImageSourceSignature(revision, input, referenceHash)
          )
            return { kind: 'conflict' } as const;
          const entry: DraftVisualEntry = {
            entityId: candidate.entityId,
            purpose: candidate.purpose,
            variant: candidate.variant,
            label: candidate.label,
            candidateId: candidate.candidateId,
            contentHash: candidate.contentHash,
            mediaType: candidate.mediaType,
            sourceRevision: candidate.sourceRevision,
            sourceSignature: candidate.sourceSignature,
            referenceHash: candidate.referenceHash,
            state: 'CURRENT',
            staleReason: null,
          };
          entries.push(entry);
        }
        const next = newVisualManifest(revision, manifest.version + 1, entries, this.#time());
        if ([...this.#selectionGuards].some((guard) => !guard(input, revision, next)))
          return { kind: 'conflict' } as const;
        this.#manifests.get(`${scopeKey(input)}/${input.revision}`)?.push(next);
        this.#selectionNonces.set(nonce, { fingerprint, manifest: next });
        return { kind: 'saved', manifest: copy(next) } as const;
      }),
    );
  }
  content(scope: DraftImageScope, hash: string) {
    return Promise.resolve(copy(this.#bytes.get(`${scopeKey(scope)}/${hash}`) ?? null));
  }
}
