import type pg from 'pg';

import { admit } from './admission.ts';
import { recordResponse } from './attempt-responses.ts';
import { fixedStep, type Deadline } from './deadline.ts';
import { readCommitted } from './pg-transaction.ts';
import type { Resolve } from './stop-scope.ts';
import { holdWithStop, releasePreDispatch, settle } from './settlement.ts';
import type {
  AdmissionRequest,
  AdmissionResult,
  BudgetStore,
  ReleaseOutcome,
  SettlementInput,
  SettlementOutcome,
  SuspectReason,
} from './types.ts';

/**
 * The PostgreSQL budget store (migration 0005): the only production spending authority. `resolve`
 * maps recorded identities to canonical models through the pinned verified catalog (B2).
 */
export class PostgresBudgetStore implements BudgetStore {
  readonly #pool: pg.Pool;
  readonly #resolve: Resolve;

  constructor(pool: pg.Pool, resolve: Resolve) {
    this.#pool = pool;
    this.#resolve = resolve;
  }

  admit(request: AdmissionRequest, requestDeadline: Deadline): Promise<AdmissionResult> {
    return admit(this.#pool, request, requestDeadline, this.#resolve);
  }

  settle(input: SettlementInput): Promise<SettlementOutcome> {
    return settle(this.#pool, input);
  }

  releasePreDispatch(attemptId: string): Promise<ReleaseOutcome> {
    return releasePreDispatch(this.#pool, attemptId);
  }

  holdWithStop(
    attemptId: string,
    reason: SuspectReason,
    returnedModel: string | null,
  ): Promise<void> {
    return holdWithStop(this.#pool, attemptId, reason, returnedModel);
  }

  recordResponse(
    attemptId: string,
    providerRequestId: string,
    returnedModel: string | null,
  ): Promise<void> {
    return recordResponse(this.#pool, attemptId, providerRequestId, returnedModel);
  }
}

/** Counts only: no campaign, session or amount ever leaves this report. */
export interface AccountingStatus {
  readonly openHolds: number;
  readonly activeStops: number;
  readonly incompleteRequests: number;
  readonly disabledAccounts: number;
  readonly disabledApprovals: number;
}

/** What startup reports: held and pending state, never reconciled silently. */
export function accountingStatus(pool: pg.Pool): Promise<AccountingStatus> {
  return readCommitted(pool, fixedStep(), async (tx) => {
    const { rows } = await tx.query<Record<keyof AccountingStatus, number>>(
      `SELECT
        (SELECT count(*) FROM ltw_ai_attempts a WHERE NOT EXISTS (
           SELECT 1 FROM ltw_ai_accounting c WHERE c.attempt_id = a.attempt_id
             AND c.kind <> 'evidence'))::int AS "openHolds",
        (SELECT count(*) FROM ltw_ai_stops s WHERE NOT EXISTS (
           SELECT 1 FROM ltw_ai_stop_clearances c WHERE c.stop_id = s.stop_id))::int AS "activeStops",
        (SELECT count(*) FROM ltw_ai_requests r WHERE NOT EXISTS (
           SELECT 1 FROM ltw_ai_request_outcomes o WHERE o.request_id = r.request_id))::int
           AS "incompleteRequests",
        (SELECT count(*) FROM ltw_ai_billing_accounts b WHERE NOT (
           SELECT enabled FROM ltw_ai_account_revisions r WHERE r.account_id = b.account_id
           ORDER BY revision DESC LIMIT 1))::int AS "disabledAccounts",
        (SELECT count(*) FROM ltw_ai_approvals p WHERE NOT (
           SELECT enabled FROM ltw_ai_approval_revisions r WHERE r.approval_id = p.approval_id
           ORDER BY revision DESC LIMIT 1))::int AS "disabledApprovals"`,
    );
    const row = rows[0];
    if (row === undefined) throw new Error('accounting status unavailable');
    return row;
  });
}

/**
 * Whether an approval record exists (B2 composition). Approvals are append-only and never deleted,
 * so a stored one stays stored; any failure answers false, which keeps every route local.
 */
export async function approvalExists(pool: pg.Pool, approvalId: string): Promise<boolean> {
  try {
    return await readCommitted(pool, fixedStep(), async (tx) => {
      const { rows } = await tx.query<{ stored: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM ltw_ai_approvals WHERE approval_id = $1) AS stored',
        [approvalId],
      );
      return rows[0]?.stored === true;
    });
  } catch {
    return false;
  }
}
