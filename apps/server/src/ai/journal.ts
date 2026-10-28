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
import type { AccountingSession } from './accounting/types.ts';
import { FINALIZER_GRACE_MS, finalize, startRequest } from './accounting/request-journal.ts';
import { readDiagnostic } from './diagnostics.ts';
import { PostgresAiTraceStore } from './postgres-trace-store.ts';

/**
 * The request journal behind every AI use case (docs/STAGE_300_REMEDIATION_DESIGN.md §2;
 * docs/adr/0032-live-ai.md, B2), over the checkpoint-A primitives (`accounting/request-journal.ts`).
 *
 * - `begin` commits the durable request start in its own short transaction, bounded by
 *   MIN(the caller's remaining time, 5 s); its ID is the trace ID. Composition supplies the route
 *   identity: the approval (only for a capability with an admitted remote route and a session)
 *   and the configured model alias; the journal's session binding decides the session class (a
 *   play session, or the registered evaluation run of a trusted evaluation composition, C).
 *   Admission later reads them from this stored row, never from a caller.
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

/**
 * Which session class a journal charges (design §1; ADR 0032, checkpoint C). Runtime charges the
 * play session the use case captured from the authorized campaign snapshot. A trusted evaluation
 * composition charges its operator-registered run instead (the evaluation CLI, after checking the
 * run's binding to the approval and campaign); the run ID never comes from a request or a world.
 * In both, a request the use case began without a session stays local only (no approval).
 */
export type SessionBinding =
  { readonly class: 'play' } | { readonly class: 'evaluation'; readonly runId: string };

export const PLAY_SESSIONS: SessionBinding = Object.freeze({ class: 'play' });

/** The accounting session of a request start under `binding`, or null (local only). */
export function accountingSession(
  binding: SessionBinding,
  sessionId: string | null,
): AccountingSession | null {
  if (sessionId === null) return null;
  return binding.class === 'play'
    ? { class: 'play', sessionId }
    : { class: 'evaluation', runId: binding.runId };
}

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
  readonly #sessions: SessionBinding;

  constructor(
    pool: pg.Pool,
    report: (issue: AccountingIssue) => void = () => undefined,
    sessions: SessionBinding = PLAY_SESSIONS,
  ) {
    this.#pool = pool;
    this.#traces = new PostgresAiTraceStore(pool);
    this.#report = report;
    this.#sessions = sessions;
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
        session: accountingSession(this.#sessions, start.sessionId),
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

  npcReplies(
    campaignId: string,
    npcId: string,
    speakerId: string,
    limit: number,
  ): Promise<readonly string[]> {
    return this.#traces.npcReplies(campaignId, npcId, speakerId, limit);
  }

  diagnose(campaignId: string, traceId: string): Promise<AiAccountingDiagnosticView | null> {
    return readDiagnostic(this.#pool, campaignId, traceId);
  }
}
