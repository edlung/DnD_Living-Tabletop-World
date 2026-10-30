import { randomUUID } from 'node:crypto';
import {
  startCampaignActivationSchema,
  campaignActivationViewSchema,
  type OwnedCampaign,
} from '@ltw/contracts';

import { imageDigest } from '../workshop/images/manifest.ts';
import {
  activationRequestFingerprint,
  frozenCampaignActivationSchema,
  sameRevision,
} from '../workshop/activation/content.ts';
import { frozenActivationDigestsValid } from '../workshop/activation/digests.ts';
import type {
  ActivationScope,
  ActivationOperationScope,
  ActivationLease,
  CampaignActivationRepository,
  StoredCampaignActivation,
} from '../workshop/activation/store.ts';
import type { CampaignPublicationState } from '../campaigns/publication.ts';
import type { MemoryCampaignRevisionRepository } from './campaign-packages.ts';
import type { MemoryDraftImageRepository } from './draft-image-store.ts';
import type { MemoryCampaignRevisionControlRepository } from './revision-controls.ts';
import type { MemoryWorkshopStore } from './workshop-store.ts';
import { memoryActivationProof, type MemoryActivationProof } from './activation-proof.ts';

type Mutable<T> = { -readonly [P in keyof T]: T[P] };
const key = (scope: ActivationScope) => `${scope.ownerId}/${scope.draftId}`;
const copy = <T>(value: T): T => structuredClone(value);
export class MemoryCampaignActivationRepository implements CampaignActivationRepository {
  readonly #rows = new Map<string, Mutable<StoredCampaignActivation>>();
  readonly #workshop: MemoryWorkshopStore;
  readonly #packages: MemoryCampaignRevisionRepository;
  readonly #images: MemoryDraftImageRepository;
  readonly #controls: Pick<MemoryCampaignRevisionControlRepository, 'locksWithinDraftLock'>;
  readonly #now: () => number;
  #proof: MemoryActivationProof | null = null;
  #tail: Promise<void> = Promise.resolve();
  constructor(
    workshop: MemoryWorkshopStore,
    packages: MemoryCampaignRevisionRepository,
    images: MemoryDraftImageRepository,
    controls: Pick<MemoryCampaignRevisionControlRepository, 'locksWithinDraftLock'>,
    now = Date.now,
  ) {
    this.#workshop = workshop;
    this.#packages = packages;
    this.#images = images;
    this.#controls = controls;
    this.#now = now;
  }
  configureProof(proof: MemoryActivationProof) {
    this.#proof = proof;
  }
  async #atomic<T>(work: () => T | Promise<T>): Promise<T> {
    const prior = this.#tail;
    let release = () => {};
    this.#tail = new Promise((resolve) => {
      release = resolve;
    });
    await prior;
    try {
      return await work();
    } finally {
      release();
    }
  }
  #time() {
    return new Date(this.#now()).toISOString();
  }
  #auth(ownerId: string, sessionId: string) {
    return [...this.#workshop.sessions.values()].some(
      (session) =>
        session.ownerId === ownerId &&
        session.sessionId === sessionId &&
        session.revokedAt === null &&
        session.createdAt <= this.#time() &&
        session.expiresAt > this.#time(),
    );
  }
  #lease(lease: ActivationLease) {
    const row = this.#rows.get(key(lease));
    return row &&
      row.activationId === lease.activationId &&
      row.status === 'PROVISIONING' &&
      row.workerId === lease.workerId &&
      row.fence === lease.fence &&
      (row.leaseUntil ?? '') > this.#time()
      ? row
      : null;
  }
  async get(scope: ActivationScope) {
    if (!(await this.#workshop.draft(scope.ownerId, scope.draftId))) return null;
    return copy(this.#rows.get(key(scope)) ?? null);
  }
  status(scope: ActivationScope) {
    const row = this.#rows.get(key(scope));
    return Promise.resolve(
      row
        ? campaignActivationViewSchema.parse({
            activationId: row.activationId,
            draftId: row.draftId,
            campaignId: row.campaignId,
            revision: row.revision,
            packageDigest: row.packageDigest,
            planDigest: row.planDigest,
            manifestDigest: row.manifestDigest,
            textOnly: row.textOnly,
            status: row.status,
            phase: row.phase,
            failureCode: row.failureCode,
            retryable: row.retryable,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            publishedAt: row.publishedAt,
          })
        : null,
    );
  }
  async byRequest(scope: ActivationScope, requestId: string) {
    const row = await this.get(scope);
    return row?.requestId === requestId ? row : null;
  }
  begin(
    input: Parameters<CampaignActivationRepository['begin']>[0],
  ): ReturnType<CampaignActivationRepository['begin']> {
    const request = startCampaignActivationSchema.parse(input.request);
    return this.#packages.withDraftLock(input, () =>
      this.#atomic(async () => {
        if (!(await this.#workshop.draft(input.ownerId, input.draftId)))
          return { kind: 'not-found' };
        if (!this.#auth(input.ownerId, input.authSessionId))
          return { kind: 'conflict', reason: 'STALE_REVIEW' };
        const prior = this.#rows.get(key(input)),
          fingerprint = activationRequestFingerprint(request);
        if (prior)
          return prior.requestId !== request.requestId
            ? { kind: 'conflict', reason: 'ALREADY_ACTIVATED' }
            : prior.requestFingerprint !== fingerprint
              ? { kind: 'conflict', reason: 'REQUEST_REUSED' }
              : { kind: 'saved', activation: copy(prior) };
        const head = await this.#packages.latest(input.ownerId, input.draftId);
        if (!head) return { kind: 'not-found' };
        if (head.revision !== request.revision || head.digest !== request.packageDigest)
          return { kind: 'conflict', reason: 'STALE_REVISION' };
        const locks = this.#controls.locksWithinDraftLock(input, head);
        if (locks.version !== request.expectedLockVersion || locks.digest !== request.lockDigest)
          return { kind: 'conflict', reason: 'STALE_LOCKS' };
        const manifest = this.#images.snapshotManifest(input, head.revision);
        if (
          !manifest ||
          manifest.version !== request.manifestVersion ||
          manifest.digest !== request.manifestDigest
        )
          return { kind: 'conflict', reason: 'STALE_MANIFEST' };
        const parsedFrozen = frozenCampaignActivationSchema.safeParse(input.frozen);
        if (!parsedFrozen.success) return { kind: 'conflict', reason: 'NOT_READY' };
        const frozen = parsedFrozen.data,
          acknowledged = [...new Set(request.acknowledgedFindingIds)].sort(),
          required = [...new Set(frozen.requiredFindingIds)].sort();
        if (
          acknowledged.length !== request.acknowledgedFindingIds.length ||
          imageDigest(acknowledged) !== imageDigest(required) ||
          imageDigest(acknowledged) !==
            imageDigest([...new Set(frozen.acknowledgedFindingIds)].sort()) ||
          required.some((id) => !frozen.findingIds.includes(id))
        )
          return { kind: 'conflict', reason: 'ACKNOWLEDGEMENTS' };
        if (
          !sameRevision(head, frozen.revision) ||
          frozen.lockVersion !== locks.version ||
          frozen.lockDigest !== locks.digest ||
          imageDigest(frozen.manifest) !== imageDigest(manifest) ||
          request.reviewDigest !== frozen.reviewDigest ||
          request.planDigest !== frozen.planDigest ||
          request.textOnly !== frozen.textOnly ||
          !frozenActivationDigestsValid(input, frozen)
        )
          return { kind: 'conflict', reason: 'STALE_REVIEW' };
        const activationId = randomUUID(),
          time = this.#time();
        const row: Mutable<StoredCampaignActivation> = {
          activationId,
          ownerId: input.ownerId,
          draftId: input.draftId,
          campaignId: randomUUID(),
          bootstrapCommandId: `activation:${activationId}`,
          authSessionId: input.authSessionId,
          requestId: request.requestId,
          requestFingerprint: fingerprint,
          revision: head.revision,
          packageDigest: head.digest,
          planDigest: frozen.planDigest,
          manifestDigest: manifest.digest,
          textOnly: frozen.textOnly,
          frozen,
          status: 'PROVISIONING',
          phase: 'RESERVED',
          failureCode: null,
          retryable: true,
          createdAt: time,
          updatedAt: time,
          publishedAt: null,
          workerId: null,
          fence: '0',
          leaseUntil: null,
          nextAttemptAt: time,
        };
        this.#rows.set(key(input), copy(row));
        return { kind: 'saved', activation: copy(row) };
      }),
    );
  }
  retry(
    scope: ActivationOperationScope,
    authSessionId: string,
  ): ReturnType<CampaignActivationRepository['retry']> {
    return this.#atomic(() => {
      if (!this.#auth(scope.ownerId, authSessionId))
        return { kind: 'conflict', reason: 'STALE_REVIEW' };
      const row = this.#rows.get(key(scope));
      if (!row || row.activationId !== scope.activationId) return { kind: 'not-found' };
      if (row.status !== 'PUBLISHED' && !row.retryable)
        return { kind: 'conflict', reason: 'NOT_READY' };
      if (row.status !== 'PUBLISHED') {
        row.nextAttemptAt = this.#time();
        row.updatedAt = this.#time();
      }
      return { kind: 'saved', activation: copy(row) };
    });
  }
  pending(max: number) {
    return Promise.resolve(
      [...this.#rows.values()]
        .filter(
          (row) =>
            row.status === 'PROVISIONING' &&
            row.retryable &&
            (row.leaseUntil ?? '') <= this.#time() &&
            (row.nextAttemptAt ?? '') <= this.#time(),
        )
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.activationId.localeCompare(b.activationId),
        )
        .slice(0, Math.max(1, Math.min(50, max)))
        .map((row) => ({
          ownerId: row.ownerId,
          draftId: row.draftId,
          activationId: row.activationId,
        })),
    );
  }
  claim(scope: ActivationOperationScope, workerId: string) {
    return this.#atomic(() => {
      const row = this.#rows.get(key(scope));
      if (
        !row ||
        row.activationId !== scope.activationId ||
        row.status !== 'PROVISIONING' ||
        !row.retryable ||
        (row.leaseUntil ?? '') > this.#time() ||
        (row.nextAttemptAt ?? '') > this.#time()
      )
        return null;
      row.fence = String(BigInt(row.fence) + 1n);
      row.workerId = workerId;
      row.leaseUntil = new Date(this.#now() + 30000).toISOString();
      row.nextAttemptAt = null;
      row.updatedAt = this.#time();
      return { activation: copy(row), lease: { ...scope, workerId, fence: row.fence } };
    });
  }
  renew(lease: ActivationLease) {
    return this.#atomic(() => {
      const row = this.#lease(lease);
      if (!row) return false;
      row.leaseUntil = new Date(this.#now() + 30000).toISOString();
      row.updatedAt = this.#time();
      return true;
    });
  }
  phase(lease: ActivationLease, phase: 'CONTENT_READY' | 'BOOTSTRAPPED') {
    return this.#atomic(() => {
      const row = this.#lease(lease);
      if (!row) return false;
      const phases = ['RESERVED', 'CONTENT_READY', 'BOOTSTRAPPED'];
      if (phases.indexOf(phase) > phases.indexOf(row.phase)) row.phase = phase;
      row.updatedAt = this.#time();
      return true;
    });
  }
  fail(lease: ActivationLease, code: string, retryable: boolean) {
    if (!/^[A-Z][A-Z0-9_]{0,99}$/.test(code)) throw new Error('INVALID_ACTIVATION_FAILURE');
    return this.#atomic(() => {
      const row = this.#lease(lease);
      if (!row) return false;
      row.failureCode = code;
      row.retryable = retryable;
      row.leaseUntil = null;
      row.nextAttemptAt = retryable ? new Date(this.#now() + 5000).toISOString() : null;
      row.updatedAt = this.#time();
      return true;
    });
  }
  publish(lease: ActivationLease, proof: Parameters<CampaignActivationRepository['publish']>[1]) {
    return this.#atomic(async () => {
      const row = this.#rows.get(key(lease));
      if (
        !row ||
        row.activationId !== lease.activationId ||
        row.fence !== lease.fence ||
        row.workerId !== lease.workerId ||
        !this.#proof
      )
        return false;
      if (row.status !== 'PUBLISHED' && (!this.#lease(lease) || row.phase !== 'BOOTSTRAPPED'))
        return false;
      if (!(await memoryActivationProof(this.#proof, row, proof))) return false;
      if (row.status === 'PUBLISHED') return true;
      if (!this.#lease(lease)) return false;
      row.status = 'PUBLISHED';
      row.phase = 'PUBLISHED';
      row.publishedAt = this.#time();
      row.updatedAt = this.#time();
      row.leaseUntil = null;
      row.nextAttemptAt = null;
      row.failureCode = null;
      row.retryable = false;
      return true;
    });
  }
  #owned(row: StoredCampaignActivation): OwnedCampaign {
    if (!row.publishedAt) throw new Error('TEST_UNPUBLISHED');
    return {
      campaignId: row.campaignId,
      activationId: row.activationId,
      draftId: row.draftId,
      revision: row.revision,
      title: row.frozen.revision.content.world.name,
      language: row.frozen.revision.content.world.language,
      createdAt: row.createdAt,
      publishedAt: row.publishedAt,
    };
  }
  owned(
    ownerId: string,
    max: number,
    before?: Pick<OwnedCampaign, 'publishedAt' | 'activationId'> | null,
  ) {
    return Promise.resolve(
      [...this.#rows.values()]
        .filter((row) => row.ownerId === ownerId && row.status === 'PUBLISHED')
        .map((row) => this.#owned(row))
        .filter(
          (row) =>
            !before ||
            row.publishedAt < before.publishedAt ||
            (row.publishedAt === before.publishedAt && row.activationId < before.activationId),
        )
        .sort(
          (a, b) =>
            b.publishedAt.localeCompare(a.publishedAt) ||
            b.activationId.localeCompare(a.activationId),
        )
        .slice(0, Math.max(1, Math.min(50, max)))
        .map(copy),
    );
  }
  ownedCampaign(ownerId: string, campaignId: string) {
    return Promise.resolve(
      copy(
        [...this.#rows.values()].find(
          (row) =>
            row.ownerId === ownerId && row.campaignId === campaignId && row.status === 'PUBLISHED',
        ),
      ),
    ).then((row) => (row ? this.#owned(row) : null));
  }
  ownedActivation(ownerId: string, activationId: string) {
    return Promise.resolve(
      copy(
        [...this.#rows.values()].find(
          (row) =>
            row.ownerId === ownerId &&
            row.activationId === activationId &&
            row.status === 'PUBLISHED',
        ),
      ),
    ).then((row) => (row ? this.#owned(row) : null));
  }
  publicationState(campaignId: string): CampaignPublicationState {
    const row = [...this.#rows.values()].find((value) => value.campaignId === campaignId);
    return !row ? 'UNTRACKED' : row.status === 'PUBLISHED' ? 'PUBLISHED' : 'UNPUBLISHED';
  }
}
