import type pg from 'pg';

import { admit } from './admission.ts';
import { fixedStep, type Deadline } from './deadline.ts';
import { readCommitted } from './pg-transaction.ts';
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

/** The PostgreSQL budget store (migration 0005): the only production spending authority. */
export class PostgresBudgetStore implements BudgetStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  admit(request: AdmissionRequest, requestDeadline: Deadline): Promise<AdmissionResult> {
    return admit(this.#pool, request, requestDeadline);
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
