import type { AiCapability, AiTraceView } from '@ltw/contracts';

import type { RequestDeadline } from './request-deadline.ts';

/**
 * The request journal and trace port (docs/adr/0017-ai-gateway.md §7; docs/adr/0032-live-ai.md,
 * B2). Traces are DM data, not canonical state: append-only, one per AI request. Every request first
 * persists a durable start; its ID is also the trace ID. Only a confirmed start lets a request run
 * a provider and return a trace ID. The request's result is frozen once, then its caller outcome
 * and its trace are stored together, exactly once. The server keeps all of this in PostgreSQL; the
 * in-memory store serves tests and development.
 */
export interface AiRequestStart {
  /** Also the trace ID. */
  readonly requestId: string;
  readonly campaignId: string;
  readonly actorId: string;
  readonly purpose: AiTraceView['purpose'];
  readonly capability: AiCapability;
  readonly scope: string;
  readonly sourceIds: readonly string[];
  /** The play session captured when the request began; null means local only. */
  readonly sessionId: string | null;
}

/** A frozen result: its trace and the caller outcome stored with it. */
export interface FrozenOutcome {
  readonly trace: AiTraceView;
  readonly status: string;
  /** The provider that produced a usable result, else null. */
  readonly provider: string | null;
  /** The fallback result's fixed code, else null (a valid result). */
  readonly code: string | null;
}

export interface AiTraceStore {
  /**
   * Persists the request start within `deadline`. True only for a confirmed durable start; false
   * (or a rejection) means none was confirmed, and the request then runs no provider.
   */
  start(start: AiRequestStart, deadline: RequestDeadline): Promise<boolean>;
  /**
   * Stores the frozen outcome and its trace together, once. The caller waits for it at most until
   * its own deadline; the store bounds the write itself (the server: stored deadline plus 5 s).
   */
  finalize(outcome: FrozenOutcome, deadline: RequestDeadline): Promise<void>;
  /** The trace, or null when it does not exist in that campaign. */
  get(campaignId: string, traceId: string): Promise<AiTraceView | null>;
  /**
   * The trace IDs of an NPC's spoken replies (`REPLIED`) to one character in a campaign, oldest
   * first, at most `limit` (the latest). Only that it spoke, never what: the NPC dialogue context
   * counts them as having met (docs/adr/0020-npc-intelligence.md, amendment 2026-10-28, round 2).
   */
  npcReplies(
    campaignId: string,
    npcId: string,
    speakerId: string,
    limit: number,
  ): Promise<readonly string[]>;
}

/** Whether a trace is an NPC's spoken reply to this character. */
export const isNpcReplyTo = (trace: AiTraceView, npcId: string, speakerId: string): boolean =>
  trace.purpose === 'npc-dialogue' &&
  trace.status === 'REPLIED' &&
  trace.scope === `NPC:${npcId}` &&
  trace.speakerId === speakerId;

/** A finalization that contradicts an outcome already stored: never an overwrite. */
export class OutcomeConflict extends Error {
  constructor(requestId: string) {
    super(`request ${requestId} already has a different outcome`);
    this.name = 'OutcomeConflict';
  }
}

export class InMemoryAiTraceStore implements AiTraceStore {
  readonly #starts = new Map<string, AiRequestStart>();
  readonly #outcomes = new Map<string, string>();
  readonly #traces = new Map<string, AiTraceView>();

  start(start: AiRequestStart): Promise<boolean> {
    this.#starts.set(start.requestId, structuredClone(start));
    return Promise.resolve(true);
  }

  finalize(outcome: FrozenOutcome): Promise<void> {
    const { traceId } = outcome.trace;
    if (!this.#starts.has(traceId)) {
      return Promise.reject(new Error(`request ${traceId} was never started`));
    }
    const digest = JSON.stringify([outcome.status, outcome.provider, outcome.code, outcome.trace]);
    const existing = this.#outcomes.get(traceId);
    if (existing !== undefined) {
      return existing === digest ? Promise.resolve() : Promise.reject(new OutcomeConflict(traceId));
    }
    this.#outcomes.set(traceId, digest);
    this.#traces.set(traceId, structuredClone(outcome.trace));
    return Promise.resolve();
  }

  get(campaignId: string, traceId: string): Promise<AiTraceView | null> {
    const trace = this.#traces.get(traceId);
    return Promise.resolve(trace?.campaignId === campaignId ? structuredClone(trace) : null);
  }

  npcReplies(
    campaignId: string,
    npcId: string,
    speakerId: string,
    limit: number,
  ): Promise<readonly string[]> {
    const ids = [...this.#traces.values()]
      .filter((trace) => trace.campaignId === campaignId && isNpcReplyTo(trace, npcId, speakerId))
      .map((trace) => trace.traceId);
    return Promise.resolve(limit > 0 ? ids.slice(-limit) : []);
  }

  /** Every trace, in insertion order (tests). */
  all(): AiTraceView[] {
    return [...this.#traces.values()].map((trace) => structuredClone(trace));
  }

  /** Every request start, in order (tests). */
  starts(): AiRequestStart[] {
    return [...this.#starts.values()].map((start) => structuredClone(start));
  }

  /** The stored caller outcome of a request: its status, provider and code (tests). */
  outcome(
    requestId: string,
  ): { status: string; provider: string | null; code: string | null } | null {
    const digest = this.#outcomes.get(requestId);
    if (digest === undefined) return null;
    const [status, provider, code] = JSON.parse(digest) as [string, string | null, string | null];
    return { status, provider, code };
  }
}
