import type pg from 'pg';

import { readImageBudgetStatus, type ImageBudgetStatus } from '../../images/ledger.ts';
import {
  ORPHAN_AFTER_MINUTES,
  readOpenImageReservations,
  type OpenImageReservation,
} from '../../images/ledger-operator.ts';
import { fixedStep } from './deadline.ts';
import { readCommitted } from './pg-transaction.ts';
import { EFFECTIVE } from './spend.ts';

/**
 * `pnpm ai:operator spend` (docs/adr/0037-deployment.md, operations; `deploy/scripts/spend.sh`):
 * the operator's spending counters. Per billing account: effective spend on the database's UTC
 * day and in total, what open holds still reserve, and the latest ceiling and switch; per
 * approval: effective spend against its latest stage ceiling. Effective spend is `spend.ts`'s
 * definition (a terminal attempt counts its largest absolute charge, an open one its hold or
 * larger evidence). Beside them, the image ledger (docs/adr/0035-images.md §2): its ceiling,
 * spent (settled charges as settled, open reservations whole), held, remaining, and every
 * unsettled reservation. Read-only, one transaction; integer microdollars as strings. Never logged
 * at startup and never shown to a campaign: amounts stay with the operator.
 */
export interface AccountSpend {
  readonly accountId: string;
  readonly enabled: boolean;
  readonly globalDailyCeilingMicros: string;
  readonly todayMicros: string;
  readonly totalMicros: string;
  readonly openHoldMicros: string;
}

export interface ApprovalSpend {
  readonly approvalId: string;
  readonly accountId: string;
  readonly stage: string;
  readonly enabled: boolean;
  readonly stageCeilingMicros: string;
  readonly spentMicros: string;
}

/** The image ledger's counters (`ledger.ts`) and its unsettled reservations, oldest first. */
export interface ImageSpend extends ImageBudgetStatus {
  /**
   * Each still counts whole in `spentMicros` and `heldMicros` until its job settles it; one older
   * than `settleableAfterMinutes` is orphaned, and only the operator closes it
   * (`image-reservation-settle`, docs/adr/0035-images.md, amendment 2026-10-16).
   */
  readonly unsettledReservations: readonly OpenImageReservation[];
  readonly settleableAfterMinutes: number;
}

export interface SpendReport {
  /** The database's UTC day, `YYYY-MM-DD`: the day `todayMicros` counts. */
  readonly day: string;
  readonly accounts: readonly AccountSpend[];
  readonly approvals: readonly ApprovalSpend[];
  readonly images: ImageSpend;
}

const OPEN = `NOT EXISTS (SELECT 1 FROM ltw_ai_accounting c
  WHERE c.attempt_id = per.attempt_id AND c.kind <> 'evidence')`;

export function spendReport(pool: pg.Pool): Promise<SpendReport> {
  return readCommitted(pool, fixedStep(), async (tx) => {
    const day = await tx.query<{ day: string }>(
      `SELECT to_char((clock_timestamp() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day`,
    );
    const today = day.rows[0]?.day;
    if (today === undefined) throw new Error('database day unavailable');
    const accounts = await tx.query<AccountSpend>(
      `WITH per AS (${EFFECTIVE})
       SELECT b.account_id AS "accountId", latest.enabled,
         latest.global_daily_ceiling_micros::text AS "globalDailyCeilingMicros",
         COALESCE(sum(per.effective) FILTER (WHERE per.billing_day = $1::date), 0)::text
           AS "todayMicros",
         COALESCE(sum(per.effective), 0)::text AS "totalMicros",
         COALESCE(sum(per.effective) FILTER (WHERE ${OPEN}), 0)::text AS "openHoldMicros"
       FROM ltw_ai_billing_accounts b
       JOIN LATERAL (
         SELECT r.enabled, r.global_daily_ceiling_micros FROM ltw_ai_account_revisions r
         WHERE r.account_id = b.account_id ORDER BY r.revision DESC LIMIT 1
       ) latest ON true
       LEFT JOIN per ON per.account_id = b.account_id
       GROUP BY b.account_id, latest.enabled, latest.global_daily_ceiling_micros
       ORDER BY b.account_id`,
      [today],
    );
    const approvals = await tx.query<ApprovalSpend>(
      `WITH per AS (${EFFECTIVE})
       SELECT p.approval_id AS "approvalId", p.account_id AS "accountId", p.stage,
         latest.enabled, latest.stage_ceiling_micros::text AS "stageCeilingMicros",
         COALESCE(sum(per.effective), 0)::text AS "spentMicros"
       FROM ltw_ai_approvals p
       JOIN LATERAL (
         SELECT r.enabled, r.stage_ceiling_micros FROM ltw_ai_approval_revisions r
         WHERE r.approval_id = p.approval_id ORDER BY r.revision DESC LIMIT 1
       ) latest ON true
       LEFT JOIN per ON per.approval_id = p.approval_id
       GROUP BY p.approval_id, p.account_id, p.stage, latest.enabled, latest.stage_ceiling_micros
       ORDER BY p.approval_id`,
    );
    const images: ImageSpend = {
      ...(await readImageBudgetStatus(tx)),
      unsettledReservations: await readOpenImageReservations(tx, 0),
      settleableAfterMinutes: ORPHAN_AFTER_MINUTES,
    };
    return { day: today, accounts: accounts.rows, approvals: approvals.rows, images };
  });
}
