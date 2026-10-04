import type { AiTraceView } from '@ltw/contracts';

/**
 * The trace port (docs/adr/0017-ai-gateway.md §7). Traces are DM data, not
 * canonical state: append-only, one per AI request. The server keeps them in
 * PostgreSQL; this in-memory store serves tests and development.
 */
export interface AiTraceStore {
  append(trace: AiTraceView): Promise<void>;
  /** The trace, or null when it does not exist in that campaign. */
  get(campaignId: string, traceId: string): Promise<AiTraceView | null>;
}

export class InMemoryAiTraceStore implements AiTraceStore {
  readonly #traces = new Map<string, AiTraceView>();

  append(trace: AiTraceView): Promise<void> {
    if (this.#traces.has(trace.traceId)) {
      return Promise.reject(new Error(`trace ${trace.traceId} already recorded`));
    }
    this.#traces.set(trace.traceId, structuredClone(trace));
    return Promise.resolve();
  }

  get(campaignId: string, traceId: string): Promise<AiTraceView | null> {
    const trace = this.#traces.get(traceId);
    return Promise.resolve(trace?.campaignId === campaignId ? structuredClone(trace) : null);
  }

  /** Every trace, in insertion order (tests). */
  all(): AiTraceView[] {
    return [...this.#traces.values()].map((trace) => structuredClone(trace));
  }
}
