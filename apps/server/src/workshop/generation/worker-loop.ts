import type { Logger } from '../../platform/logging/logger.ts';
import type { CampaignGenerationRepository } from './store.ts';
import type { GenerationJobScope } from './store.ts';

/** The scheduler discovers scopes internally; it exposes no cross-owner HTTP inventory. */
export function startCampaignGenerationLoop(
  repository: CampaignGenerationRepository,
  worker: { run(scope: GenerationJobScope): Promise<void>; stop(): Promise<void> },
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
        logger.warn(
          { code: 'CAMPAIGN_GENERATION_STORAGE' },
          'campaign preparation worker unavailable',
        );
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
