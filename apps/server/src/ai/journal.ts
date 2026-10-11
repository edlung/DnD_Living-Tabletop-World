import {
  OutcomeConflict,
  type AiRequestStart,
  type AiTraceStore,
  type FrozenOutcome,
  type RequestDeadline,
} from '@ltw/ai';
import type { AiAccountingDiagnosticView, AiTraceView } from '@ltw/contracts';
import type pg from 'pg';

import type { AccountingIssue } from './accounting-tasks.ts';
import { FINALIZER_GRACE_MS, finalize, startRequest } from './accounting/request-journal.ts';
import { readDiagnostic } from './diagnostics.ts';
import { PostgresAiTraceStore } from './postgres-trace-store.ts';

/**
 * The request journal behind every AI use case (docs/STAGE_300_REMEDIATION_DESIGN.md §2;
 * docs/adr/0032-live-ai.md, B2), over the checkpoint-A primitives (`accounting/request-journal.ts`).
 *
 * - `begin` commits the durable request start in its own short transaction, bounded by
 *   MIN(the caller's remaining time, 5 s); its ID is the trace ID. Composition supplies the route
 *   identity: the approval (only for a capability with an admitted remote route and a play
 *   session) and the configured model alias. Admission later reads them from this stored row,
 *   never from a caller.
 * - `finalize` stores the frozen caller outcome (status, provider, fallback code, digest) and the
 *   insert-only trace atomically, once, inside the stored window (caller deadline plus 5 s). A
 *   conflicting outcome is an integrity failure, reported and never overwritten; a closed window
 *   leaves the request for recovery (`recovered_incomplete`, diagnostic only).
 * - `diagnose` is the DM's read-only accounting view of one request in one campaign.
 */
export interface RouteIdentity {
  readonly approvalId: string | null;
  readonly configuredModel: string | null;
}

export const LOCAL_ONLY: RouteIdentity = { approvalId: null, configuredModel: null };

export interface AiJournal extends AiTraceStore {
  begin(
    start: AiRequestStart,
    identity: RouteIdentity,
    deadline: RequestDeadline,
  ): Promise<boolean>;
  diagnose(campaignId: string, traceId: string): Promise<AiAccountingDiagnosticView | null>;
}

export class PostgresAiJournal implements AiJournal {
  readonly #pool: pg.Pool;
  readonly #traces: PostgresAiTraceStore;
  readonly #report: (issue: AccountingIssue) => void;

  constructor(pool: pg.Pool, report: (issue: AccountingIssue) => void = () => undefined) {
    this.#pool = pool;
    this.#traces = new PostgresAiTraceStore(pool);
    this.#report = report;
  }

  async begin(
    start: AiRequestStart,
    identity: RouteIdentity,
    deadline: RequestDeadline,
  ): Promise<boolean> {
    const outcome = await startRequest(
      this.#pool,
      {
        requestId: start.requestId,
        campaignId: start.campaignId,
        actorId: start.actorId,
        purpose: start.purpose,
        capability: start.capability,
        scope: start.scope,
        sourceIds: start.sourceIds,
        session: start.sessionId === null ? null : { class: 'play', sessionId: start.sessionId },
        // An approval only with a session: a session-less request is local only.
        approvalId: start.sessionId === null ? null : identity.approvalId,
        configuredModel: identity.configuredModel,
      },
      { atMs: deadline.atMs },
    );
    return outcome.status === 'started';
  }

  start(start: AiRequestStart, deadline: RequestDeadline): Promise<boolean> {
    return this.begin(start, LOCAL_ONLY, deadline);
  }

  async finalize(outcome: FrozenOutcome, deadline: RequestDeadline): Promise<void> {
    const { trace } = outcome;
    let result;
    try {
      result = await finalize(
        this.#pool,
        {
          requestId: trace.traceId,
          status: outcome.status,
          provider: outcome.provider,
          code: outcome.code,
          traceJson: JSON.stringify(trace),
          trace: {
            campaignId: trace.campaignId,
            actorId: trace.actorId,
            purpose: trace.purpose,
            createdAt: trace.createdAt,
          },
        },
        // The live finalizer's absolute bound; the stored window clamps it further.
        { atMs: deadline.atMs + FINALIZER_GRACE_MS },
      );
    } catch (error) {
      this.#report('OUTCOME_NOT_RECORDED');
      throw error;
    }
    if (result === 'conflict') {
      this.#report('OUTCOME_CONFLICT');
      throw new OutcomeConflict(trace.traceId);
    }
    if (result !== 'recorded' && result !== 'duplicate') this.#report('OUTCOME_NOT_RECORDED');
  }

  get(campaignId: string, traceId: string): Promise<AiTraceView | null> {
    return this.#traces.get(campaignId, traceId);
  }

  diagnose(campaignId: string, traceId: string): Promise<AiAccountingDiagnosticView | null> {
    return readDiagnostic(this.#pool, campaignId, traceId);
  }
}
