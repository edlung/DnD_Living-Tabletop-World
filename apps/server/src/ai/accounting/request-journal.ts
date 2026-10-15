import { createHash } from 'node:crypto';

import type pg from 'pg';

import {
  boundByRequest,
  expired,
  fixedStep,
  remainingMs,
  storageStep,
  type Deadline,
} from './deadline.ts';
import { requestLockKey } from './lock-keys.ts';
import { StorageUnavailable, readCommitted, type Tx } from './pg-transaction.ts';
import { AccountingRejection, sessionKey, type RequestStart } from './types.ts';

/**
 * Request starts, caller outcomes and recovery (docs/STAGE_300_REMEDIATION_DESIGN.md §2).
 * Checkpoint A provided these primitives; at B2 every AI use case runs through them
 * (`ai/journal.ts`), and the live outcome also records the fallback outcome code (migration 0007).
 *
 * - A start commits in its own short transaction with no advisory lock; its stored deadline is
 *   database `clock_timestamp()` plus the caller's remaining monotonic time, computed after every
 *   preparatory wait as the INSERT is sent (never a stale, longer duration). A start whose COMMIT
 *   is unconfirmed reports failure; if it did commit, recovery handles it like any orphan start.
 * - A live finalizer inserts the caller outcome and the insert-only trace atomically under the
 *   request lock, only while database time is within the stored deadline plus 5,000 ms, through
 *   every wait, write and COMMIT (see `finalize`; migration 0006 guards the commit). Its digest is
 *   over the exact JSON string the caller supplied for the trace.
 * - Recovery appends `recovered_incomplete` only after that window, under the exclusive policy
 *   lock and the same request lock; it never writes a trace. No bucket lock is ever nested here.
 */
export const FINALIZER_GRACE_MS = 5_000;

export type StartOutcome =
  | { readonly status: 'started' }
  | { readonly status: 'failed'; readonly reason: 'CALLER_CANCELLED' | 'UNAVAILABLE' };

export async function startRequest(
  pool: pg.Pool,
  start: RequestStart,
  requestDeadline: Deadline,
): Promise<StartOutcome> {
  if (expired(requestDeadline)) return { status: 'failed', reason: 'CALLER_CANCELLED' };
  const session = start.session === null ? null : sessionKey(start.session);
  const step = storageStep(requestDeadline);
  try {
    await readCommitted(pool, step, async (tx) => {
      await tx.query(
        `INSERT INTO ltw_ai_requests (request_id, campaign_id, actor_id, purpose, capability, scope,
           source_ids, approval_id, session_class, session_id, configured_model, deadline_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11,
           clock_timestamp() + make_interval(secs => $12::double precision / 1000))`,
        // Evaluated after every preparatory wait, as the INSERT is sent: the caller's time left.
        () => {
          const remaining = Math.floor(remainingMs(requestDeadline));
          if (remaining <= 0) throw new StorageUnavailable('timeout');
          return [
            start.requestId,
            start.campaignId,
            start.actorId,
            start.purpose,
            start.capability,
            start.scope,
            JSON.stringify(start.sourceIds),
            start.approvalId,
            session?.sessionClass ?? null,
            session?.sessionId ?? null,
            start.configuredModel,
            remaining,
          ];
        },
      );
    });
    return { status: 'started' };
  } catch (error) {
    // A timeout of a step bounded by the request's deadline is that deadline (deadline.ts).
    const requestTimedOut =
      error instanceof StorageUnavailable &&
      error.reason === 'timeout' &&
      boundByRequest(requestDeadline, step);
    return {
      status: 'failed',
      reason: expired(requestDeadline) || requestTimedOut ? 'CALLER_CANCELLED' : 'UNAVAILABLE',
    };
  }
}

/** SHA-256 of the exact serialized trace; serialize once and pass the same string to `finalize`. */
export const traceDigest = (traceJson: string): string =>
  createHash('sha256').update(traceJson, 'utf8').digest('hex');

export interface FinalOutcome {
  readonly requestId: string;
  readonly status: string;
  readonly provider: string | null;
  /** The fallback result's fixed code (migration 0007); null for a valid result. */
  readonly code: string | null;
  /** The trace exactly as stored: serialized once by the caller. */
  readonly traceJson: string;
  readonly trace: {
    readonly campaignId: string;
    readonly actorId: string;
    readonly purpose: string;
    readonly createdAt: string;
  };
}

export type FinalizeResult =
  'recorded' | 'duplicate' | 'conflict' | 'lost-to-recovery' | 'window-closed' | 'unknown-request';

/** The finalizer window as the database measures it, with any existing outcome. */
const WINDOW_READ = `
  SELECT extract(epoch FROM r.deadline_at + make_interval(secs => $2) - clock_timestamp()) * 1000
      AS finalizer_window_ms,
    o.kind, o.trace_digest
  FROM ltw_ai_requests r LEFT JOIN ltw_ai_request_outcomes o USING (request_id)
  WHERE r.request_id = $1`;

/**
 * Classifies an existing outcome, or returns the local cutoff of the stored window. The database
 * measured its remaining window after the statement was sent, so the window cannot close locally
 * before `sentAt + remaining`; a late answer shortens what is left and never extends it.
 */
async function readWindow(
  tx: Tx,
  requestId: string,
  digest: string,
): Promise<Deadline | FinalizeResult> {
  let sentAt = 0;
  const row = (
    await tx.query<{
      finalizer_window_ms: string;
      kind: string | null;
      trace_digest: string | null;
    }>(WINDOW_READ, () => {
      sentAt = performance.now();
      return [requestId, FINALIZER_GRACE_MS / 1000];
    })
  ).rows[0];
  if (row === undefined) return 'unknown-request';
  if (row.kind === 'recovered_incomplete') return 'lost-to-recovery';
  if (row.kind === 'live') return row.trace_digest === digest ? 'duplicate' : 'conflict';
  const cutoff: Deadline = { atMs: sentAt + Number(row.finalizer_window_ms) };
  if (expired(cutoff)) throw new AccountingRejection('WINDOW_CLOSED');
  return cutoff;
}

/**
 * Inserts the live outcome and the trace atomically, only inside the stored window: the
 * transaction is clamped to the database-measured window before and after the request lock, the
 * outcome INSERT itself requires the window, and migration 0006 rechecks it while committing. A
 * window that closes anywhere on the way yields `window-closed` with nothing stored, so recovery
 * stays possible. A COMMIT whose answer does not arrive in time is thrown as `commitUnknown`: it
 * may have committed (inside the window), and is never reported as recorded or as rolled back.
 * `deadline` is the caller's own bound; it can only shorten the window, never lengthen it.
 */
export async function finalize(
  pool: pg.Pool,
  outcome: FinalOutcome,
  deadline: Deadline,
): Promise<FinalizeResult> {
  const digest = traceDigest(outcome.traceJson);
  const window: { cutoff: Deadline | null } = { cutoff: null };
  try {
    return await readCommitted(pool, deadline, async (tx) => {
      const before = await readWindow(tx, outcome.requestId, digest);
      if (typeof before === 'string') return before;
      window.cutoff = before;
      tx.clamp(before);
      await tx.lock(requestLockKey(outcome.requestId), 'exclusive');
      const after = await readWindow(tx, outcome.requestId, digest);
      if (typeof after === 'string') return after;
      window.cutoff = after;
      tx.clamp(after);
      const inserted = await tx.query(
        `INSERT INTO ltw_ai_request_outcomes (request_id, kind, status, provider, trace_digest, code)
         SELECT r.request_id, 'live', $2, $3, $4, $6 FROM ltw_ai_requests r
         WHERE r.request_id = $1
           AND clock_timestamp() <= r.deadline_at + make_interval(secs => $5)`,
        [
          outcome.requestId,
          outcome.status,
          outcome.provider,
          digest,
          FINALIZER_GRACE_MS / 1000,
          outcome.code,
        ],
      );
      if (inserted.rowCount !== 1) throw new AccountingRejection('WINDOW_CLOSED');
      await tx.query(
        `INSERT INTO ltw_ai_traces (trace_id, campaign_id, actor_id, purpose, status, trace, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          outcome.requestId,
          outcome.trace.campaignId,
          outcome.trace.actorId,
          outcome.trace.purpose,
          outcome.status,
          outcome.traceJson,
          outcome.trace.createdAt,
        ],
      );
      return 'recorded';
    });
  } catch (error) {
    if (error instanceof AccountingRejection && error.code === 'WINDOW_CLOSED') {
      return 'window-closed';
    }
    // Timed out while the database window was the binding bound, with nothing committed (COMMIT
    // unsent): the window closed. A caller-deadline timeout is the caller's, and is thrown.
    if (
      error instanceof StorageUnavailable &&
      error.reason === 'timeout' &&
      !error.commitUnknown &&
      window.cutoff !== null &&
      window.cutoff.atMs <= deadline.atMs
    ) {
      return 'window-closed';
    }
    throw error;
  }
}

export type RecoveryResult = 'recovered' | 'not-eligible';

/**
 * Appends `recovered_incomplete` for one request whose finalizer window has closed and that has no
 * caller outcome. Exclusive policy lock, then the request lock, then a recheck under READ
 * COMMITTED. Holds are untouched: recovery never settles, refunds or writes a trace.
 */
export async function recoverRequest(pool: pg.Pool, requestId: string): Promise<RecoveryResult> {
  return readCommitted(pool, fixedStep(), async (tx) => {
    await tx.policy('exclusive');
    await tx.lock(requestLockKey(requestId), 'exclusive');
    const inserted = await tx.query(
      `INSERT INTO ltw_ai_request_outcomes (request_id, kind)
       SELECT r.request_id, 'recovered_incomplete' FROM ltw_ai_requests r
       WHERE r.request_id = $1
         AND clock_timestamp() > r.deadline_at + make_interval(secs => $2)
         AND NOT EXISTS (SELECT 1 FROM ltw_ai_request_outcomes o WHERE o.request_id = r.request_id)`,
      [requestId, FINALIZER_GRACE_MS / 1000],
    );
    return inserted.rowCount === 1 ? 'recovered' : 'not-eligible';
  });
}

/** Requests past their finalizer window with no caller outcome (read without locks). */
export async function incompleteRequests(pool: pg.Pool, limit = 500): Promise<string[]> {
  return readCommitted(pool, fixedStep(), async (tx) => {
    const { rows } = await tx.query<{ request_id: string }>(
      `SELECT r.request_id FROM ltw_ai_requests r
       WHERE clock_timestamp() > r.deadline_at + make_interval(secs => $1)
         AND NOT EXISTS (SELECT 1 FROM ltw_ai_request_outcomes o WHERE o.request_id = r.request_id)
       ORDER BY r.deadline_at LIMIT $2`,
      [FINALIZER_GRACE_MS / 1000, limit],
    );
    return rows.map((row) => row.request_id);
  });
}
