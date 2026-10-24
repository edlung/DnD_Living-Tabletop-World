import { createHash } from 'node:crypto';

import {
  imageFailureCode,
  ImageGenerationError,
  type ImageBrief,
  type ImageGenerator,
} from '@ltw/ai';
import type { CommandResult, KernelCommand } from '@ltw/contracts';
import type { Actor, AssetJobRecord, WorldEngine, WorldState } from '@ltw/domain';

import type { Logger } from '../platform/logging/logger.ts';
import type { AssetContentStore, StoredContent } from './content-store.ts';

/**
 * The asset worker (docs/adr/0022-asset-identity.md §4): a trusted system
 * process that runs queued asset requests. For each it records that the job
 * started (from then on it cannot be recalled, ADR 0006 §9), asks the image
 * generator, stores the bytes, and records the outcome. It writes nothing
 * else: an image never becomes a world fact.
 *
 * Command IDs derive from the request ID, so a retried step is the same
 * command (idempotent) and a job left running by a crash is finished on the
 * next run. A job the DM cancelled while it ran is still completed if the
 * generator answers: its asset is recorded as discarded, for lineage.
 */
export const ASSET_WORKER: Actor = { actorId: 'asset-worker', kind: 'system' };

export interface AssetWorkerDeps {
  readonly engine: WorldEngine;
  readonly contents: AssetContentStore;
  readonly generator: ImageGenerator;
  /** How long one generation may take before it fails as `TIMEOUT`. */
  readonly timeoutMs: number;
  readonly logger: Logger;
  /** Requests this worker leaves alone: the server's skips the curated import's own. */
  readonly skip?: (requestId: string, campaignId: string) => boolean;
}

export interface AssetRunSummary {
  readonly started: number;
  readonly completed: number;
  readonly failed: number;
}

type Step = 'start' | 'complete' | 'fail';

/** A short, valid, deterministic command ID for one step of one request. */
export const workerCommandId = (step: Step, requestId: string) =>
  `asset-worker.${step}.${createHash('sha256').update(requestId).digest('hex').slice(0, 40)}`;

export class AssetWorker {
  readonly #deps: AssetWorkerDeps;

  constructor(deps: AssetWorkerDeps) {
    this.#deps = deps;
  }

  /**
   * Starts every queued request of the campaign, then runs every job still running. With `only`,
   * just those requests: the curated import (ADR 0035) runs its own and leaves the DM's alone.
   */
  async runOnce(campaignId: string, only?: ReadonlySet<string>): Promise<AssetRunSummary> {
    const summary = { started: 0, completed: 0, failed: 0 };
    const mine = (requestId: string) =>
      (only === undefined || only.has(requestId)) &&
      this.#deps.skip?.(requestId, campaignId) !== true;
    const queued = await this.#state(campaignId);
    if (!queued) return summary;
    for (const request of queued.assets.requests.values()) {
      if (!mine(request.requestId)) continue;
      if (request.cancelled || queued.assets.jobs.has(request.requestId)) continue;
      const result = await this.#execute(campaignId, 'start', request.requestId, {
        type: 'StartAssetJob',
        requestId: request.requestId,
      });
      if (result.status !== 'rejected') summary.started += 1;
    }
    const running = await this.#state(campaignId);
    for (const job of running?.assets.jobs.values() ?? []) {
      if (job.status !== 'STARTED' || !running || !mine(job.requestId)) continue;
      const outcome = await this.#run(campaignId, running, job);
      summary[outcome] += 1;
    }
    return summary;
  }

  async #run(
    campaignId: string,
    state: WorldState,
    job: AssetJobRecord,
  ): Promise<'completed' | 'failed'> {
    const { generator, contents, timeoutMs, logger } = this.#deps;
    try {
      const brief = await briefFor(state, job, (hash) => contents.get(campaignId, hash));
      const image = await withTimeout(timeoutMs, (signal) =>
        generator.generate(brief, signal, { campaignId, requestId: job.requestId }),
      );
      const contentHash = await contents.put(campaignId, {
        bytes: image.bytes,
        mediaType: image.mediaType,
      });
      const result = await this.#execute(campaignId, 'complete', job.requestId, {
        type: 'CompleteAssetJob',
        requestId: job.requestId,
        contentHash,
        mediaType: image.mediaType,
        generator: { provider: generator.id, model: image.model },
      });
      if (result.status !== 'rejected') return 'completed';
      logger.warn({ code: result.code }, 'asset completion rejected');
    } catch (error) {
      logger.warn({ code: imageFailureCode(error) }, 'asset generation failed');
      await this.#execute(campaignId, 'fail', job.requestId, {
        type: 'FailAssetJob',
        requestId: job.requestId,
        reason: imageFailureCode(error),
      });
    }
    return 'failed';
  }

  async #state(campaignId: string): Promise<WorldState | null> {
    return (await this.#deps.engine.load(campaignId))?.state ?? null;
  }

  #execute(
    campaignId: string,
    step: Step,
    requestId: string,
    command: KernelCommand,
  ): Promise<CommandResult> {
    return this.#deps.engine.execute({
      commandId: workerCommandId(step, requestId),
      campaignId,
      actor: ASSET_WORKER,
      command,
    });
  }
}

/**
 * What the generator is told: the entity as the DM knows it, the request, and for a derived
 * variant the bytes of the canonical reference it derives from (ADR 0035 §1). Never stored.
 */
async function briefFor(
  state: WorldState,
  job: AssetJobRecord,
  content: (contentHash: string) => Promise<StoredContent | null>,
): Promise<ImageBrief> {
  const entity = state.entities.get(job.entityId);
  if (!entity) throw new ImageGenerationError('PROVIDER_ERROR', 'the entity is gone');
  const base = job.derivedFrom === null ? null : state.assets.assets.get(job.derivedFrom);
  // Unreadable bytes are no reference: a generator that needs one then makes no call.
  const stored = base ? await content(base.contentHash).catch(() => null) : null;
  return {
    seed: job.requestId,
    subject: {
      entityId: entity.entityId,
      kind: entity.kind,
      name: entity.name,
      description: entity.description,
    },
    variant: job.variant,
    purpose: job.purpose,
    label: job.label,
    note: job.note,
    basedOn: base?.contentHash ?? null,
    reference: stored ? { bytes: stored.bytes, mediaType: stored.mediaType } : null,
  };
}

async function withTimeout<T>(ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ImageGenerationError('TIMEOUT', 'image generation timed out'));
    }, ms);
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
