import type {
  CampaignGenerationCandidate,
  CampaignRevision,
  DraftLockSnapshot,
  DraftVisualManifest,
} from '@ltw/contracts';
import { replaceDraftLocksSchema } from '@ltw/contracts';
import { validateCampaignEditOutput } from '@ltw/domain';

import { imageDigest } from '../workshop/images/manifest.ts';
import { assessCampaignRevision } from '../workshop/packages/compiler.ts';
import {
  captureDraftLocks,
  draftLockConflicts,
  lockSnapshot,
  prospectiveVisualManifest,
  revisionReviewDigest,
  privateRevisionIntent,
} from '../workshop/revisions/policy.ts';
import type { CampaignGenerationRepository } from '../workshop/generation/store.ts';
import type {
  AdoptCampaignCandidate,
  CampaignRevisionControlRepository,
  ControlledRevisionResult,
  ReplaceDraftLocks,
  RestoreCampaignRevision,
  ReviewedRevisionWrite,
  RevisionControlScope,
} from '../workshop/revisions/store.ts';
import type { AppendCampaignRevision } from '../workshop/packages/store.ts';
import type { MemoryCampaignRevisionRepository } from './campaign-packages.ts';
import type { MemoryDraftImageRepository } from './draft-image-store.ts';
import type { MemoryWorkshopStore } from './workshop-store.ts';

const key = (scope: RevisionControlScope) => `${scope.ownerId}/${scope.draftId}`;
const copy = <T>(value: T): T => structuredClone(value);
export class MemoryCampaignRevisionControlRepository implements CampaignRevisionControlRepository {
  readonly workshop: MemoryWorkshopStore;
  readonly revisions: MemoryCampaignRevisionRepository;
  readonly images: MemoryDraftImageRepository;
  readonly generation: readonly Pick<CampaignGenerationRepository, 'get' | 'candidate'>[];
  readonly now: () => number;
  readonly #locks = new Map<string, DraftLockSnapshot[]>();
  readonly #nonces = new Map<string, { fingerprint: string; locks: DraftLockSnapshot }>();
  readonly #receipts = new Map<
    string,
    { operation: string; intent: unknown; revision: CampaignRevision }
  >();
  constructor(
    workshop: MemoryWorkshopStore,
    revisions: MemoryCampaignRevisionRepository,
    images: MemoryDraftImageRepository,
    generation: readonly Pick<CampaignGenerationRepository, 'get' | 'candidate'>[],
    now = Date.now,
  ) {
    this.workshop = workshop;
    this.revisions = revisions;
    this.images = images;
    this.generation = generation;
    this.now = now;
    revisions.registerAppendGuard((input, revision) => {
      const locks = this.#locks.get(key(input))?.at(-1) ?? null;
      if ((locks?.version ?? 0) !== (input.expectedLockVersion ?? 0))
        return { kind: 'conflict', reason: 'STALE_LOCKS' };
      const parent = images.snapshotManifest(input, revision.basedOnRevision);
      if (
        input.expectedManifestVersion !== undefined &&
        (parent?.version !== input.expectedManifestVersion ||
          parent.digest !== input.expectedManifestDigest)
      )
        return { kind: 'conflict', reason: 'STALE_MANIFEST' };
      return draftLockConflicts(locks, revision, prospectiveVisualManifest(revision, parent)).length
        ? { kind: 'conflict', reason: 'LOCKED_CONTENT' }
        : null;
    });
    images.registerSelectionGuard((scope, revision, manifest) => {
      const locks = this.#locks.get(key(scope))?.at(-1);
      return (
        draftLockConflicts(
          locks
            ? { ...locks, entries: locks.entries.filter((e) => e.target.kind === 'image') }
            : null,
          revision,
          manifest,
        ).length === 0
      );
    });
  }
  #time() {
    return new Date(this.now()).toISOString();
  }
  #active(ownerId: string, sessionId: string) {
    return [...this.workshop.sessions.values()].some(
      (s) =>
        s.ownerId === ownerId &&
        s.sessionId === sessionId &&
        s.revokedAt === null &&
        s.createdAt <= this.#time() &&
        s.expiresAt > this.#time(),
    );
  }
  locksWithinDraftLock(scope: RevisionControlScope, head: CampaignRevision): DraftLockSnapshot {
    let values = this.#locks.get(key(scope));
    if (!values) {
      const manifest = this.images.snapshotManifest(scope, head.revision);
      if (!manifest) throw new Error('TEST_MANIFEST_MISSING');
      values = [lockSnapshot(head, manifest, 0, [], this.#time())];
      this.#locks.set(key(scope), values);
    }
    const current = values.at(-1);
    if (!current) throw new Error('TEST_LOCKS_MISSING');
    return copy(current);
  }
  async locks(scope: RevisionControlScope) {
    if (!(await this.workshop.draft(scope.ownerId, scope.draftId))) return null;
    return this.revisions.withDraftLock(scope, async () => {
      const head = await this.revisions.latest(scope.ownerId, scope.draftId);
      return head ? this.locksWithinDraftLock(scope, head) : null;
    });
  }
  async replaceLocks(
    input: ReplaceDraftLocks,
  ): ReturnType<CampaignRevisionControlRepository['replaceLocks']> {
    const { ownerId, draftId, authSessionId, ...body } = input;
    const fingerprint = imageDigest(replaceDraftLocksSchema.parse(body));
    if (!(await this.workshop.draft(ownerId, draftId))) return { kind: 'not-found' };
    return this.revisions.withDraftLock(input, async () => {
      if (!this.#active(ownerId, authSessionId))
        return { kind: 'conflict', reason: 'STALE_REVIEW' };
      const nonce = `${key(input)}/${input.requestId}`,
        old = this.#nonces.get(nonce);
      if (old)
        return old.fingerprint === fingerprint
          ? { kind: 'saved', locks: copy(old.locks) }
          : { kind: 'conflict', reason: 'REQUEST_REUSED' };
      const head = await this.revisions.latest(ownerId, draftId);
      if (!head) return { kind: 'not-found' };
      if (head.revision !== input.revision || head.digest !== input.packageDigest)
        return { kind: 'conflict', reason: 'STALE_REVISION' };
      const locks = this.locksWithinDraftLock(input, head);
      if (locks.version !== input.expectedLockVersion)
        return { kind: 'conflict', reason: 'STALE_LOCKS' };
      const manifest = this.images.snapshotManifest(input, head.revision);
      if (
        !manifest ||
        manifest.version !== input.manifestVersion ||
        manifest.digest !== input.manifestDigest
      )
        return { kind: 'conflict', reason: 'STALE_MANIFEST' };
      const entries = captureDraftLocks(head, manifest, input.targets);
      if (!entries) return { kind: 'conflict', reason: 'INVALID_TARGET' };
      const next = lockSnapshot(head, manifest, locks.version + 1, entries, this.#time());
      this.#locks.get(key(input))?.push(next);
      this.#nonces.set(nonce, { fingerprint, locks: next });
      return { kind: 'saved', locks: copy(next) };
    });
  }
  #intent(input: ReviewedRevisionWrite) {
    return privateRevisionIntent(input);
  }
  async #prepare(
    input: ReviewedRevisionWrite,
    operation: 'ADOPTION' | 'RESTORE',
  ): Promise<
    | ControlledRevisionResult
    | { head: CampaignRevision; locks: DraftLockSnapshot; manifest: DraftVisualManifest }
  > {
    if (!(await this.workshop.draft(input.ownerId, input.draftId)))
      return { kind: 'not-found' } as const;
    if (!this.#active(input.ownerId, input.authSessionId))
      return { kind: 'conflict', reason: 'STALE_REVIEW' } as const;
    const receipt = this.#receipts.get(`${key(input)}/${input.requestId}`);
    if (receipt)
      return receipt.operation === operation &&
        imageDigest(receipt.intent) === imageDigest(this.#intent(input))
        ? ({ kind: 'saved', revision: copy(receipt.revision) } as const)
        : ({ kind: 'conflict', reason: 'REQUEST_REUSED' } as const);
    const head = await this.revisions.latest(input.ownerId, input.draftId);
    if (!head) return { kind: 'not-found' } as const;
    if (head.revision !== input.basedOnRevision || head.digest !== input.packageDigest)
      return { kind: 'conflict', reason: 'STALE_REVISION' } as const;
    const locks = this.locksWithinDraftLock(input, head);
    if (locks.version !== input.expectedLockVersion)
      return { kind: 'conflict', reason: 'STALE_LOCKS' } as const;
    const manifest = this.images.snapshotManifest(input, head.revision);
    if (
      !manifest ||
      manifest.version !== input.manifestVersion ||
      manifest.digest !== input.manifestDigest
    )
      return { kind: 'conflict', reason: 'STALE_MANIFEST' } as const;
    return { head, locks, manifest };
  }
  adopt(input: AdoptCampaignCandidate): Promise<ControlledRevisionResult> {
    return this.revisions.withDraftLock(input, async () => {
      const initial = await this.#prepare(input, 'ADOPTION');
      if ('kind' in initial) return initial;
      let candidate: CampaignGenerationCandidate | null = null;
      for (const repository of this.generation) {
        const job = await repository.get(input);
        if (!job || job.status !== 'SUCCEEDED' || !job.candidateAvailable) continue;
        candidate = await repository.candidate(input);
        if (
          job.mode === 'EDIT' &&
          (!job.editSpec ||
            !validateCampaignEditOutput(initial.head, candidate?.content, job.editSpec).ok)
        )
          return { kind: 'conflict', reason: 'INVALID_CANDIDATE' };
        if (candidate) break;
      }
      if (!candidate) return { kind: 'not-found' };
      if (candidate.baseRevision !== initial.head.revision)
        return { kind: 'conflict', reason: 'STALE_REVISION' };
      if (
        candidate.contentDigest !== input.candidateDigest ||
        candidate.source.kind !== 'AI' ||
        candidate.source.jobId !== input.jobId
      )
        return { kind: 'conflict', reason: 'INVALID_CANDIDATE' };
      if (
        revisionReviewDigest({
          kind: 'ADOPTION',
          sourceId: input.jobId,
          sourceDigest: candidate.contentDigest,
          headDigest: initial.head.digest,
          lockDigest: initial.locks.digest,
          manifestDigest: initial.manifest.digest,
        }) !== input.reviewDigest
      )
        return { kind: 'conflict', reason: 'STALE_REVIEW' };
      return this.#save(input, 'ADOPTION', candidate.content, candidate.source, true);
    });
  }
  restore(input: RestoreCampaignRevision): Promise<ControlledRevisionResult> {
    return this.revisions.withDraftLock(input, async () => {
      const initial = await this.#prepare(input, 'RESTORE');
      if ('kind' in initial) return initial;
      const historical = await this.revisions.get(
        input.ownerId,
        input.draftId,
        input.restoreRevision,
      );
      if (!historical) return { kind: 'not-found' };
      if (
        revisionReviewDigest({
          kind: 'RESTORE',
          sourceId: String(input.restoreRevision),
          sourceDigest: historical.digest,
          headDigest: initial.head.digest,
          lockDigest: initial.locks.digest,
          manifestDigest: initial.manifest.digest,
        }) !== input.reviewDigest
      )
        return { kind: 'conflict', reason: 'STALE_REVIEW' };
      return this.#save(
        input,
        'RESTORE',
        historical.content,
        { kind: 'OWNER', actorId: input.ownerId },
        false,
      );
    });
  }
  async #save(
    input: ReviewedRevisionWrite,
    operation: 'ADOPTION' | 'RESTORE',
    content: CampaignRevision['content'],
    source: CampaignRevision['source'],
    assess: boolean,
  ): Promise<ControlledRevisionResult> {
    const append: AppendCampaignRevision = {
      ownerId: input.ownerId,
      draftId: input.draftId,
      requestId: input.requestId,
      basedOnRevision: input.basedOnRevision,
      content,
      source,
      createdAt: this.#time(),
      expectedLockVersion: input.expectedLockVersion,
      writePolicy: { operation, intent: this.#intent(input) },
    };
    const staged = this.revisions.prepareAppendWithinDraftLock(append),
      result = staged.result;
    if (result.kind === 'conflict')
      return {
        kind: 'conflict',
        reason: result.reason === 'IDENTITY_KIND_CHANGED' ? 'INVALID_CANDIDATE' : result.reason,
      };
    if (result.kind !== 'saved') return result;
    if (
      assess &&
      (await assessCampaignRevision(result.revision, input.ownerId)).readiness === 'INVALID'
    )
      return { kind: 'conflict', reason: 'INVALID_CANDIDATE' };
    if (!this.#active(input.ownerId, input.authSessionId))
      return { kind: 'conflict', reason: 'STALE_REVIEW' };
    staged.commit();
    this.#receipts.set(`${key(input)}/${input.requestId}`, {
      operation,
      intent: this.#intent(input),
      revision: result.revision,
    });
    return result;
  }
}
