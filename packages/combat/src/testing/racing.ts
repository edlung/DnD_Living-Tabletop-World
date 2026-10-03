import {
  SequentialIds,
  SteppingClock,
  WorldEngine,
  type AppendBatch,
  type EventStore,
  type InMemoryEventStore,
} from '@ltw/domain';

import { createCombatEngine } from '../engine.ts';
import { ScriptedEntropy } from './road.ts';

/**
 * Test support for races between server processes (ADR 0006 §7). A
 * `RacingStore` lets another engine commit right before this engine's next
 * append, so this engine decided on a state that is no longer current: its
 * append conflicts, and it must decide again on the newer state.
 */
export class RacingStore implements EventStore {
  readonly #inner: EventStore;
  #before: (() => Promise<unknown>) | null = null;
  #conflicts = 0;

  constructor(inner: EventStore) {
    this.#inner = inner;
  }

  /** Runs `step` (another process's command) just before the next append. */
  interleave(step: () => Promise<unknown>): void {
    this.#before = step;
  }

  /** Appends that lost the race. */
  get conflicts(): number {
    return this.#conflicts;
  }

  loadStream(campaignId: string, afterSequence?: number) {
    return this.#inner.loadStream(campaignId, afterSequence);
  }

  findCommand(commandId: string) {
    return this.#inner.findCommand(commandId);
  }

  loadCommands(campaignId: string) {
    return this.#inner.loadCommands(campaignId);
  }

  async append(batch: AppendBatch): Promise<void> {
    const step = this.#before;
    this.#before = null;
    if (step) await step();
    try {
      await this.#inner.append(batch);
    } catch (error) {
      this.#conflicts += 1;
      throw error;
    }
  }
}

/** A second engine (another process) on the same campaign store. */
export function rivalEngine(store: InMemoryEventStore, namespace: number) {
  const racing = new RacingStore(store);
  const entropy = new ScriptedEntropy();
  const engine = new WorldEngine({
    store: racing,
    ids: new SequentialIds(namespace),
    clock: new SteppingClock(),
    combat: createCombatEngine(),
    entropy,
    backoff: () => Promise.resolve(),
  });
  return { engine, racing, entropy };
}
