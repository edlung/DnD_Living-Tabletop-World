import type { IdGenerator, WallClock } from './event-store.ts';

/**
 * Deterministic ID and clock sources for tests, fixtures, and harnesses.
 * Production uses random UUIDs and the system clock (apps/server).
 */
export class SequentialIds implements IdGenerator {
  #counter = 0;
  readonly #namespace: number;

  /** `namespace` (0-65535) keeps IDs from parallel generators distinct. */
  constructor(namespace = 0) {
    this.#namespace = namespace;
  }

  next(): string {
    this.#counter += 1;
    const ns = this.#namespace.toString(16).padStart(4, '0');
    return `00000000-${ns}-4000-8000-${this.#counter.toString(16).padStart(12, '0')}`;
  }
}

export class SteppingClock implements WallClock {
  #epochMs: number;
  readonly #stepMs: number;

  constructor(startIso = '2026-01-01T00:00:00.000Z', stepMs = 1_000) {
    this.#epochMs = Date.parse(startIso);
    this.#stepMs = stepMs;
  }

  now(): string {
    const now = new Date(this.#epochMs).toISOString();
    this.#epochMs += this.#stepMs;
    return now;
  }
}
