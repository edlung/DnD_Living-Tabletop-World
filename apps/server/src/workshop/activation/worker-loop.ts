import type { Logger } from '../../platform/logging/logger.ts';
import type { CampaignActivationRepository } from './store.ts';
import type { CampaignActivationWorker } from './worker.ts';

/** Bounded recovery also discovers a committed bootstrap whose publication acknowledgement was lost. */
export function startCampaignActivationLoop(
  repository: CampaignActivationRepository,
  worker: CampaignActivationWorker,
  logger: Logger,
  intervalMs = 1000,
): () => Promise<void> {
  let closed = false;
  const isClosed = () => closed;
  let polling: Promise<void> | null = null;
  const running = new Set<Promise<void>>();
  const poll = async () => {
    if (closed || running.size >= 2) return;
    for (const scope of await repository.pending(25)) {
      if (isClosed() || running.size >= 2) break;
      const task = worker
        .run(scope)
        .catch(() => {
          logger.warn({ issue: 'ACTIVATION_RETRY' }, 'campaign activation needs recovery');
        })
        .finally(() => {
          running.delete(task);
        });
      running.add(task);
    }
  };
  const tick = () => {
    if (closed || polling) return;
    polling = poll()
      .catch(() => {
        logger.warn(
          { issue: 'ACTIVATION_STORE_UNAVAILABLE' },
          'campaign activation discovery unavailable',
        );
      })
      .finally(() => {
        polling = null;
      });
  };
  const timer = setInterval(tick, intervalMs);
  tick();
  return async () => {
    closed = true;
    clearInterval(timer);
    if (polling) await polling;
    await worker.shutdown();
    await Promise.allSettled(running);
  };
}
