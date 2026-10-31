import type { Logger } from '../../platform/logging/logger.ts';
import type { DraftImageRepository } from './store.ts';
import type { DraftImageWorker } from './worker.ts';

export function startDraftImageLoop(
  repository: DraftImageRepository,
  worker: DraftImageWorker,
  logger: Logger,
): () => Promise<void> {
  let stopped = false;
  let busy = false;
  let active: Promise<void> = Promise.resolve();
  const tick = () => {
    if (stopped || busy) return;
    busy = true;
    active = repository
      .pending(8)
      .then(async (scopes) => {
        for (const scope of scopes) {
          if (stopped) break;
          await worker.run(scope);
        }
      })
      .catch(() => {
        logger.warn({ code: 'DRAFT_IMAGE_STORAGE' }, 'draft image worker unavailable');
      })
      .finally(() => {
        busy = false;
      });
  };
  const timer = setInterval(tick, 1000);
  timer.unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await worker.stop();
    await active;
  };
}
