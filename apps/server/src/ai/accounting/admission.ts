import type pg from 'pg';

import { expired, storageStep, type Deadline } from './deadline.ts';
import { scopeBuckets, sortedLockKeys, type AttemptScope, type SessionClass } from './lock-keys.ts';
import { MAX_MICROS } from './money.ts';
import { StorageUnavailable, readCommitted, type Tx } from './pg-transaction.ts';
import { readBucketSpend } from './spend.ts';
import { stopDenies, type Resolve } from './stop-scope.ts';
import type { AdmissionRequest, AdmissionResult, DenialCode, DenialDetail } from './types.ts';

/**
 * Budget admission (docs/STAGE_300_REMEDIATION_DESIGN.md §1). One READ COMMITTED transaction:
 * the shared policy lock in its own statement; then the stored request, its approval's and its
 * billing account's latest revisions and the database UTC day; then the sorted bucket and
 * account-control locks, one statement each; then stops and totals; and only if every ceiling
 * admits, the attempt row with its reservation. Identity, campaign and session come from the stored
 * request, never from the caller.
 *
 * B2: the requested model must be the canonical model of its verified pricing version (`resolve`,
 * from the pinned catalog), and stops are matched by `stop-scope.ts`, with every recorded or source
 * identity resolved inside this transaction. Any identity gap denies as `ADMISSION_DISABLED` with
 * the fixed `STOPPED` detail; a storage timeout is unavailability, never a dispatch.
 */
const denied = (code: DenialCode, detail: DenialDetail): AdmissionResult => ({
  status: 'denied',
  code,
  detail,
});

interface RequestRow {
  campaign_id: string;
  approval_id: string | null;
  session_class: SessionClass | null;
  session_id: string | null;
  capability: string;
  day: string;
}

interface PolicyRow {
  account_id: string;
  account_enabled: boolean;
  approval_enabled: boolean;
  campaign_ids: string[];
  run_registered: boolean;
  global_day: string;
  campaign_day: string;
  stage: string;
  play_session: string;
  evaluation_run: string;
}

const POLICY = `
  SELECT ap.account_id, acr.enabled AS account_enabled, ar.enabled AS approval_enabled,
    ar.campaign_ids,
    EXISTS (SELECT 1 FROM ltw_ai_evaluation_runs er
            WHERE er.run_id = $2 AND er.approval_id = ap.approval_id AND er.campaign_id = $3)
      AS run_registered,
    acr.global_daily_ceiling_micros::text AS global_day,
    ar.campaign_daily_ceiling_micros::text AS campaign_day,
    ar.stage_ceiling_micros::text AS stage,
    ar.play_session_ceiling_micros::text AS play_session,
    ar.evaluation_run_ceiling_micros::text AS evaluation_run
  FROM ltw_ai_approvals ap
  JOIN LATERAL (SELECT * FROM ltw_ai_approval_revisions r WHERE r.approval_id = ap.approval_id
                ORDER BY r.revision DESC LIMIT 1) ar ON true
  JOIN LATERAL (SELECT * FROM ltw_ai_account_revisions r WHERE r.account_id = ap.account_id
                ORDER BY r.revision DESC LIMIT 1) acr ON true
  WHERE ap.approval_id = $1`;

async function admitIn(
  tx: Tx,
  request: AdmissionRequest,
  resolve: Resolve,
): Promise<AdmissionResult> {
  await tx.policy('shared');
  const stored = (
    await tx.query<RequestRow>(
      `SELECT campaign_id, approval_id, session_class, session_id, capability,
         to_char((clock_timestamp() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day
       FROM ltw_ai_requests WHERE request_id = $1`,
      [request.requestId],
    )
  ).rows[0];
  if (stored === undefined) return denied('ADMISSION_DISABLED', 'UNKNOWN_REQUEST');
  const { approval_id: approvalId, session_class: sessionClass, session_id: sessionId } = stored;
  if (approvalId === null || sessionClass === null || sessionId === null) {
    return denied('ADMISSION_DISABLED', 'NOT_ELIGIBLE');
  }
  const policy = (await tx.query<PolicyRow>(POLICY, [approvalId, sessionId, stored.campaign_id]))
    .rows[0];
  if (policy === undefined) return denied('ADMISSION_DISABLED', 'NOT_ELIGIBLE');
  if (!policy.account_enabled) return denied('ADMISSION_DISABLED', 'ACCOUNT_DISABLED');
  if (!policy.approval_enabled) return denied('ADMISSION_DISABLED', 'APPROVAL_DISABLED');
  if (!policy.campaign_ids.includes(stored.campaign_id)) {
    return denied('ADMISSION_DISABLED', 'CAMPAIGN_NOT_BOUND');
  }
  if (sessionClass === 'evaluation' && !policy.run_registered) {
    return denied('ADMISSION_DISABLED', 'RUN_NOT_REGISTERED');
  }
  const ceilings = {
    globalDay: BigInt(policy.global_day),
    campaignDay: BigInt(policy.campaign_day),
    stage: BigInt(policy.stage),
    session: BigInt(sessionClass === 'play' ? policy.play_session : policy.evaluation_run),
  };
  // Missing, zero or negative ceilings deny (the schema also refuses them).
  if (Object.values(ceilings).some((ceiling) => ceiling <= 0n)) {
    return denied('ADMISSION_DISABLED', 'NOT_ELIGIBLE');
  }

  const scope: AttemptScope = {
    accountId: policy.account_id,
    approvalId,
    campaignId: stored.campaign_id,
    sessionClass,
    sessionId,
    day: stored.day,
  };
  for (const key of sortedLockKeys(scopeBuckets(scope))) await tx.lock(key, 'exclusive');

  const target = {
    accountId: scope.accountId,
    approvalId,
    provider: request.provider,
    model: request.model,
  };
  if (await stopDenies(tx, target, resolve)) return denied('ADMISSION_DISABLED', 'STOPPED');
  const spent = await readBucketSpend(tx, scope);
  const order = [
    ['globalDay', 'GLOBAL_DAY'],
    ['campaignDay', 'CAMPAIGN_DAY'],
    ['stage', 'STAGE'],
    ['session', 'SESSION'],
  ] as const;
  for (const [bucket, detail] of order) {
    if (spent[bucket] + request.reserveMicros > ceilings[bucket]) {
      return denied('BUDGET_DENIED', detail);
    }
  }

  await tx.query(
    `INSERT INTO ltw_ai_attempts (attempt_id, request_id, account_id, approval_id, campaign_id,
       session_class, session_id, billing_day, capability, attempt_kind, provider, model,
       pricing_version, reserved_micros)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11, $12, $13, $14::bigint)`,
    [
      request.attemptId,
      request.requestId,
      scope.accountId,
      approvalId,
      scope.campaignId,
      sessionClass,
      sessionId,
      scope.day,
      stored.capability,
      request.attemptKind,
      request.provider,
      request.model,
      request.pricingVersion,
      request.reserveMicros.toString(),
    ],
  );
  return {
    status: 'admitted',
    attemptId: request.attemptId,
    billingDay: scope.day,
    reservedMicros: request.reserveMicros,
  };
}

/**
 * Admits within MIN(remaining request time, 5,000 ms). A storage failure or timeout before the
 * request expires is ADMISSION_UNAVAILABLE; once the request has expired it is CALLER_CANCELLED,
 * and no database work starts. An admission that commits is returned even if the request expired
 * meanwhile: the caller must then not dispatch, and the hold stays until a proven release. A
 * COMMIT that was sent but not confirmed denies with detail COMMIT_UNKNOWN: the hold may exist and
 * is never assumed rolled back or refunded.
 */
export async function admit(
  pool: pg.Pool,
  request: AdmissionRequest,
  requestDeadline: Deadline,
  resolve: Resolve,
): Promise<AdmissionResult> {
  if (expired(requestDeadline)) return denied('CALLER_CANCELLED', 'STORAGE');
  if (request.reserveMicros <= 0n || request.reserveMicros > MAX_MICROS) {
    return denied('ADMISSION_DISABLED', 'INVALID_RESERVATION');
  }
  // Only a verified canonical model of its pricing version is ever admitted.
  if (resolve(request.provider, request.model, request.pricingVersion) !== request.model) {
    return denied('ADMISSION_DISABLED', 'NOT_ELIGIBLE');
  }
  try {
    return await readCommitted(pool, storageStep(requestDeadline), (tx) =>
      admitIn(tx, request, resolve),
    );
  } catch (error) {
    const detail =
      error instanceof StorageUnavailable && error.commitUnknown ? 'COMMIT_UNKNOWN' : 'STORAGE';
    return expired(requestDeadline)
      ? denied('CALLER_CANCELLED', detail)
      : denied('ADMISSION_UNAVAILABLE', detail);
  }
}
