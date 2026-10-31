import { randomUUID } from 'node:crypto';

import type { DraftImageDependencies } from './runtime.ts';
import type { DraftImageJobScope, DraftImageLease } from './store.ts';

/** The adapter owns the final pre-fetch gate; this worker never uses canonical asset commands. */
export class DraftImageWorker {
  readonly #deps: DraftImageDependencies;
  readonly #workerId = randomUUID();
  readonly #running = new Map<string, { controller: AbortController; done: Promise<void> }>();

  constructor(deps: DraftImageDependencies) {
    this.#deps = deps;
  }

  cancel(jobId: string): void {
    this.#running.get(jobId)?.controller.abort();
  }

  async run(scope: DraftImageJobScope): Promise<void> {
    if (this.#running.has(scope.jobId)) return;
    const controller = new AbortController();
    const isCancelled = () => controller.signal.aborted;
    let finish: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    this.#running.set(scope.jobId, { controller, done });
    let lease: DraftImageLease | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let gateAttempted = false;
    let gateOutcome: 'DISPATCH' | 'STORED' | 'UNKNOWN' | 'FENCED' | null = null;
    const dispatchState = (): 'DISPATCH' | 'STORED' | 'UNKNOWN' | 'FENCED' | null => gateOutcome;
    try {
      const claim = await this.#deps.repository.claim(scope, this.#workerId);
      if (claim.kind !== 'claimed') return;
      lease = claim.lease;
      const activeLease = lease;
      let renewing = false;
      heartbeat = setInterval(() => {
        if (renewing) return;
        renewing = true;
        void this.#deps.repository
          .renew(activeLease)
          .then((active) => {
            if (!active) controller.abort();
          })
          .catch(() => {
            controller.abort();
          })
          .finally(() => {
            renewing = false;
          });
      }, 10_000);
      heartbeat.unref();
      const runner = await this.#deps.runtime.forJob(lease);
      if (isCancelled()) return;
      if (!runner) {
        await this.#deps.repository.fail(lease, 'IMAGE_UNAVAILABLE');
        return;
      }
      if (runner.provider !== claim.job.provider || runner.model !== claim.job.model) {
        await this.#deps.repository.fail(lease, 'ROUTE_CHANGED');
        return;
      }
      const result = await runner.run({
        input: claim.job.input,
        chargeId: lease.chargeId,
        signal: controller.signal,
        beforeDispatch: async (proof) => {
          if (isCancelled()) return false;
          gateAttempted = true;
          gateOutcome = await this.#deps.repository.beginDispatch(activeLease, proof);
          return gateOutcome === 'DISPATCH';
        },
      });
      if (isCancelled()) {
        await this.#deps.repository.fail(
          lease,
          'WORKER_ABORTED',
          result.status === 'DISPATCH_UNKNOWN' || result.execution?.outcome === 'dispatch_unknown',
        );
        return;
      }
      const gate = dispatchState();
      if (gate === 'FENCED' || gate === 'STORED') return;
      if (gate === 'UNKNOWN') {
        await this.#deps.repository.fail(lease, 'DISPATCH_UNKNOWN', true);
        return;
      }
      if (result.status !== 'GENERATED' || result.bytes === null || result.mediaType === null) {
        await this.#deps.repository.fail(
          lease,
          result.status,
          result.status === 'DISPATCH_UNKNOWN' || result.execution?.outcome === 'dispatch_unknown',
        );
        return;
      }
      if (
        gate !== 'DISPATCH' ||
        result.provider !== claim.job.provider ||
        result.model !== claim.job.model
      ) {
        await this.#deps.repository.fail(lease, 'RESULT_IDENTITY_MISMATCH', gateAttempted);
        return;
      }
      const saved = await this.#deps.repository.complete(lease, {
        bytes: result.bytes,
        mediaType: result.mediaType,
        model: result.model,
      });
      if (saved.kind === 'conflict') throw new Error('DRAFT_IMAGE_RESULT_CONFLICT');
    } catch {
      if (lease) {
        // A lost result ACK must not overwrite a committed candidate with uncertainty.
        const current = await this.#deps.repository.get(scope).catch(() => null);
        if (current?.status !== 'SUCCEEDED')
          await this.#deps.repository
            .fail(lease, 'WORKER_UNAVAILABLE', gateAttempted)
            .catch(() => undefined);
      }
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      this.#running.delete(scope.jobId);
      finish();
    }
  }

  async stop(): Promise<void> {
    const active = [...this.#running.values()];
    for (const { controller } of active) controller.abort();
    await Promise.all(active.map(({ done }) => done));
  }
}
