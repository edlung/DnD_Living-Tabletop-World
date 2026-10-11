import {
  InMemoryAiTraceStore,
  type AiRequestStart,
  type AiTraceStore,
  type FrozenOutcome,
} from '../traces.ts';

/**
 * Test support: an in-memory journal whose request start and finalization can fail, stall or be
 * held (docs/adr/0032-live-ai.md, B2). `start`: `ok` confirms; `fail` answers false; `reject`
 * throws; `stall` never answers. `finalize` waits for `release()` when `holdFinalize` is set.
 */
export interface ControlledJournal extends AiTraceStore {
  readonly store: InMemoryAiTraceStore;
  /** Lets held finalizations through (and every later one). */
  readonly release: () => void;
  readonly startCalls: () => number;
  readonly finalizeCalls: () => number;
}

export function controlledJournal(
  options: {
    readonly start?: 'ok' | 'fail' | 'reject' | 'stall';
    readonly holdFinalize?: boolean;
  } = {},
): ControlledJournal {
  const store = new InMemoryAiTraceStore();
  let starts = 0;
  let finalizes = 0;
  let open: () => void = () => undefined;
  const gate = options.holdFinalize
    ? new Promise<void>((resolve) => {
        open = resolve;
      })
    : Promise.resolve();
  return {
    store,
    release: () => {
      open();
    },
    startCalls: () => starts,
    finalizeCalls: () => finalizes,
    start: (start: AiRequestStart) => {
      starts += 1;
      switch (options.start ?? 'ok') {
        case 'ok':
          return store.start(start);
        case 'fail':
          return Promise.resolve(false);
        case 'reject':
          return Promise.reject(new Error('journal unavailable'));
        case 'stall':
          return new Promise<boolean>(() => undefined);
      }
    },
    finalize: async (outcome: FrozenOutcome) => {
      finalizes += 1;
      await gate;
      await store.finalize(outcome);
    },
    get: (campaignId, traceId) => store.get(campaignId, traceId),
  };
}

/** Busy-waits (synchronously) until the monotonic clock passes `atMs`: no timer can fire meanwhile. */
export function spinUntil(atMs: number): void {
  while (performance.now() <= atMs) {
    // Deliberately synchronous.
  }
}
