import { AssetWorker, type AssetWorkerDeps } from './worker.ts';

/**
 * Runs the asset worker periodically over every campaign with asset work.
 * One run at a time; a failed run is logged and retried on the next tick.
 * Returns a stop function that waits for the run in progress.
 */
export interface AssetWorkerLoopDeps extends AssetWorkerDeps {
  readonly intervalMs: number;
  readonly campaigns: () => Promise<readonly string[]>;
}

export function startAssetWorkerLoop(deps: AssetWorkerLoopDeps): () => Promise<void> {
  if (deps.intervalMs === 0) return () => Promise.resolve();
  const worker = new AssetWorker(deps);
  let stopped = false;
  let running: Promise<void> = Promise.resolve();
  let timer: NodeJS.Timeout | undefined;

  const tick = async (): Promise<void> => {
    try {
      for (const campaignId of await deps.campaigns()) {
        if (stopped) return;
        const summary = await worker.runOnce(campaignId);
        if (summary.started + summary.completed + summary.failed > 0) {
          deps.logger.info({ campaignId, ...summary }, 'asset worker run');
        }
      }
    } catch (error) {
      deps.logger.error({ err: error }, 'asset worker run failed');
    }
  };
  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      running = tick().then(schedule);
    }, deps.intervalMs);
  };
  schedule();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await running;
  };
}
