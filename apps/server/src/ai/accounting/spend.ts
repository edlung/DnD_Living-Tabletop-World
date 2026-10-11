import { randomUUID } from 'node:crypto';

import type { AttemptScope } from './lock-keys.ts';
import type { Tx } from './pg-transaction.ts';

/**
 * Effective spending and stops, read under the policy lock and the sorted bucket locks
 * (docs/adr/0032-live-ai.md, amendment 2026-10-11). An attempt with a terminal row counts the
 * maximum of its absolute charge rows; an open one counts the maximum of its reservation and any
 * absolute evidence. Nothing is summed as a delta and no hold is subtracted twice.
 */
const EFFECTIVE = `
  SELECT a.*,
    CASE WHEN COALESCE(e.terminal, false) THEN e.charged
         ELSE GREATEST(a.reserved_micros, COALESCE(e.charged, 0)) END AS effective
  FROM ltw_ai_attempts a
  LEFT JOIN LATERAL (
    SELECT bool_or(c.kind <> 'evidence') AS terminal, max(c.charge_micros) AS charged
    FROM ltw_ai_accounting c WHERE c.attempt_id = a.attempt_id
  ) e ON true`;

export interface BucketSpend {
  readonly globalDay: bigint;
  readonly campaignDay: bigint;
  readonly stage: bigint;
  readonly session: bigint;
}

/** A transaction, or (in tests) any client wrapped to the same `query` shape. */
export type Queryable = Pick<Tx, 'query'>;

/** Committed spend plus outstanding holds of the four buckets of `scope`, in one statement. */
export async function readBucketSpend(db: Queryable, scope: AttemptScope): Promise<BucketSpend> {
  const { rows } = await db.query<Record<keyof BucketSpend, string>>(
    `WITH per AS (${EFFECTIVE}
       WHERE a.approval_id = $3
          OR (a.account_id = $1 AND a.billing_day = $6::date)
          OR (a.campaign_id = $2 AND a.billing_day = $6::date))
     SELECT
       COALESCE(sum(effective) FILTER (WHERE account_id = $1 AND billing_day = $6::date), 0)::text
         AS "globalDay",
       COALESCE(sum(effective) FILTER (WHERE campaign_id = $2 AND billing_day = $6::date), 0)::text
         AS "campaignDay",
       COALESCE(sum(effective) FILTER (WHERE approval_id = $3), 0)::text AS "stage",
       COALESCE(sum(effective) FILTER (
         WHERE approval_id = $3 AND campaign_id = $2 AND session_class = $4 AND session_id = $5
       ), 0)::text AS "session"
     FROM per`,
    [
      scope.accountId,
      scope.campaignId,
      scope.approvalId,
      scope.sessionClass,
      scope.sessionId,
      scope.day,
    ],
  );
  const row = rows[0];
  return {
    globalDay: BigInt(row?.globalDay ?? '0'),
    campaignDay: BigInt(row?.campaignDay ?? '0'),
    stage: BigInt(row?.stage ?? '0'),
    session: BigInt(row?.session ?? '0'),
  };
}

/** The effective charge of one attempt and whether it has a terminal row. */
export async function readAttemptCharge(
  db: Queryable,
  attemptId: string,
): Promise<{ effective: bigint; terminal: boolean; reserved: bigint } | null> {
  const { rows } = await db.query<{ effective: string; terminal: boolean; reserved: string }>(
    `SELECT effective::text,
       EXISTS (SELECT 1 FROM ltw_ai_accounting c
               WHERE c.attempt_id = per.attempt_id AND c.kind <> 'evidence') AS terminal,
       reserved_micros::text AS reserved
     FROM (${EFFECTIVE} WHERE a.attempt_id = $1) per`,
    [attemptId],
  );
  const row = rows[0];
  return row
    ? { effective: BigInt(row.effective), terminal: row.terminal, reserved: BigInt(row.reserved) }
    : null;
}

export type StopReason = 'OVERRUN' | 'DISCREPANCY' | 'UNEXPECTED_MODEL' | 'UNVERIFIED_BILLING';

/**
 * The stop a new absolute charge calls for: above the reservation is an overrun; above an earlier
 * terminal charge is a discrepancy. Each stops its approval and, through its source attempt, the
 * account's provider/model on every approval (`stop-scope.ts`, B2 stop-scope delta).
 */
export function stopForCharge(
  charge: bigint,
  prior: { reserved: bigint; effective: bigint; terminal: boolean },
): StopReason | null {
  if (charge > prior.reserved) return 'OVERRUN';
  if (prior.terminal && charge > prior.effective) return 'DISCREPANCY';
  return null;
}

/**
 * Appends one immutable stop in its accepted shape (`stop-scope.ts`): an overrun or discrepancy
 * records its approval and source attempt; suspect output records the account's provider (and,
 * for an unexpected model, the attempt's canonical model; the returned one is only observed).
 * Returns the stop ID, which only an operator clearance lifts.
 */
export async function appendStop(
  db: Queryable,
  attempt: {
    attemptId: string;
    accountId: string;
    approvalId: string;
    provider: string;
    model: string;
  },
  reason: StopReason,
  observedModel: string | null = null,
): Promise<string> {
  const accountWide = reason === 'UNEXPECTED_MODEL' || reason === 'UNVERIFIED_BILLING';
  const stopId = randomUUID();
  await db.query(
    `INSERT INTO ltw_ai_stops
       (stop_id, account_id, approval_id, provider, model, reason, attempt_id, observed_model)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      stopId,
      attempt.accountId,
      accountWide ? null : attempt.approvalId,
      accountWide ? attempt.provider : null,
      reason === 'UNEXPECTED_MODEL' ? attempt.model : null,
      reason,
      attempt.attemptId,
      observedModel,
    ],
  );
  return stopId;
}
