import { randomUUID } from 'node:crypto';

import { fingerprintOf } from '@ltw/domain';

import { contentHashOf } from '../../assets/content-store.ts';
import { imageDigest, imageSlotKey } from '../images/manifest.ts';
import { frozenActivationDigestsValid } from './digests.ts';
import { activationCommandMatches } from './proof.ts';
import type { CampaignActivationDependencies } from './runtime.ts';
import { activationSubmission } from './submission.ts';
import type {
  ActivationOperationScope,
  ActivationLease,
  StoredCampaignActivation,
} from './store.ts';
import {
  ActivationFailure,
  requireActivation,
  verifyBootstrapSnapshot,
  verifyInitialContent,
} from './verification.ts';

/** Resumes accepted USER intent. No provider/preparation runtime is reachable here. */
export class CampaignActivationWorker {
  readonly #deps: CampaignActivationDependencies;
  readonly #workerId: string;
  readonly #running = new Map<string, Promise<void>>();
  #closed = false;
  constructor(deps: CampaignActivationDependencies, workerId = randomUUID()) {
    this.#deps = deps;
    this.#workerId = workerId;
  }
  run(scope: ActivationOperationScope): Promise<void> {
    if (this.#closed) return Promise.resolve();
    const existing = this.#running.get(scope.activationId);
    if (existing) return existing;
    const work = this.#execute(scope).finally(() => {
      this.#running.delete(scope.activationId);
    });
    this.#running.set(scope.activationId, work);
    return work;
  }
  async shutdown(): Promise<void> {
    this.#closed = true;
    await Promise.allSettled(this.#running.values());
  }
  async #copyPictures(record: StoredCampaignActivation, active: () => boolean): Promise<boolean> {
    const scope = { ownerId: record.ownerId, draftId: record.draftId };
    for (const asset of record.frozen.assets) {
      if (!active()) return false;
      const candidate = await this.#deps.draftImages.candidate(scope, asset.origin.candidateId);
      requireActivation(candidate !== null, 'ACTIVATION_PICTURE_SOURCE');
      requireActivation(
        candidate.jobId === asset.origin.jobId &&
          candidate.sourceRevision === asset.origin.revision &&
          imageSlotKey(candidate) === imageSlotKey(asset) &&
          candidate.contentHash === asset.contentHash &&
          candidate.mediaType === asset.mediaType &&
          candidate.sourceSignature === asset.origin.sourceSignature &&
          candidate.referenceHash === asset.origin.referenceHash &&
          imageDigest({ provider: candidate.provider, model: candidate.model }) ===
            imageDigest(asset.generator),
        'ACTIVATION_PICTURE_SOURCE',
      );
      const source = await this.#deps.draftImages.content(scope, asset.contentHash);
      requireActivation(source !== null, 'ACTIVATION_PICTURE_MISSING');
      requireActivation(
        source.mediaType === asset.mediaType && contentHashOf(source.bytes) === asset.contentHash,
        'ACTIVATION_BYTE_MISMATCH',
      );
      if (!active()) return false;
      const hash = await this.#deps.contents.put(record.campaignId, source);
      const copied = await this.#deps.contents.get(record.campaignId, asset.contentHash);
      requireActivation(
        hash === asset.contentHash &&
          copied !== null &&
          copied.mediaType === source.mediaType &&
          contentHashOf(copied.bytes) === hash &&
          Buffer.from(copied.bytes).equals(Buffer.from(source.bytes)),
        'ACTIVATION_BYTE_MISMATCH',
      );
    }
    return active();
  }
  async #execute(scope: ActivationOperationScope): Promise<void> {
    const { repository, bootstrap } = this.#deps;
    const claim = await repository.claim(scope, this.#workerId);
    if (!claim) return;
    const { activation: record, lease } = claim;
    let live = true;
    const renewal: { pending: Promise<void> | null } = { pending: null };
    const active = () => live && !this.#closed;
    const heartbeat = setInterval(() => {
      if (renewal.pending || !live) return;
      renewal.pending = repository
        .renew(lease)
        .then(
          (ok) => {
            if (!ok) live = false;
          },
          () => {
            live = false;
          },
        )
        .finally(() => {
          renewal.pending = null;
        });
    }, 10_000);
    try {
      requireActivation(frozenActivationDigestsValid(scope, record.frozen));
      if (!(await this.#copyPictures(record, active))) return;
      await this.#deps.initialContent.prepare(record);
      await verifyInitialContent(this.#deps, record);
      if (!active() || !(await repository.phase(lease, 'CONTENT_READY'))) return;
      const submission = activationSubmission(record);
      const expectedFingerprint = fingerprintOf(submission);
      const prior = (await bootstrap.commandLog(record.campaignId)).find(
        (command) => command.commandId === record.bootstrapCommandId,
      );
      if (!prior) {
        if (!active() || !(await repository.renew(lease))) return;
        const outcome = await bootstrap.execute(submission);
        if (outcome.status === 'rejected')
          throw new ActivationFailure('ACTIVATION_BOOTSTRAP_REJECTED', false);
      }
      const [snapshot, commands] = await Promise.all([
        bootstrap.load(record.campaignId),
        bootstrap.commandLog(record.campaignId),
      ]);
      requireActivation(snapshot !== null);
      const command = commands.find((item) => item.commandId === record.bootstrapCommandId);
      requireActivation(command !== undefined && commands.length === 1);
      const proof = { fingerprint: expectedFingerprint, version: snapshot.state.version };
      requireActivation(activationCommandMatches(record, command, proof));
      verifyBootstrapSnapshot(record, snapshot);
      if (!active() || !(await repository.phase(lease, 'BOOTSTRAPPED'))) return;
      const published = await repository.publish(lease, proof);
      if (!published && active() && (await repository.renew(lease)))
        throw new ActivationFailure('ACTIVATION_PUBLICATION_INCOMPLETE', true);
    } catch (error) {
      await this.#recordFailure(lease, error);
    } finally {
      live = false;
      clearInterval(heartbeat);
      if (renewal.pending) await renewal.pending;
    }
  }
  async #recordFailure(lease: ActivationLease, error: unknown) {
    const current = await this.#deps.repository.status(lease);
    if (current?.status === 'PUBLISHED') return;
    await this.#deps.repository.fail(
      lease,
      error instanceof ActivationFailure ? error.code : 'ACTIVATION_UNAVAILABLE',
      error instanceof ActivationFailure ? error.retryable : true,
    );
  }
}
