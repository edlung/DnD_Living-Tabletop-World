import type { Queryable, StopReason } from './spend.ts';

/**
 * What an uncleared stop forbids (docs/STAGE_300_B2_STOP_SCOPE_DESIGN.md, approved; docs/adr/
 * 0032-live-ai.md, B2). One immutable stop row, two effective restrictions, joined by OR:
 *
 * 1. The recorded predicate, always, as the minimum restriction: approval (null = any), provider
 *    (null = any) and model (null = any; compared as a stable canonical model).
 * 2. For `OVERRUN` and `DISCREPANCY` only, the route of the immutable source attempt: its billing
 *    account, provider and canonical model, across every approval and UTC day.
 *
 * The four accepted row shapes (anything else fails closed for the whole recorded account):
 *
 * | reason               | approval | provider | model    | source attempt                      |
 * | -------------------- | -------- | -------- | -------- | ----------------------------------- |
 * | `OVERRUN`            | set      | null     | null     | present, same account and approval  |
 * | `DISCREPANCY`        | set      | null     | null     | present, same account and approval  |
 * | `UNEXPECTED_MODEL`   | null     | set      | set      | not consulted                       |
 * | `UNVERIFIED_BILLING` | null     | set      | null     | not consulted (provider-wide)       |
 *
 * Identity: a recorded model string, or a source attempt's `(provider, model, pricing version)`,
 * resolves through the verified catalog to its canonical model. A missing, ambiguous or
 * inconsistent mapping fails closed for the account. A single operator clearance of the stop ID
 * lifts both restrictions; nothing here clears, expires or narrows a stop.
 */
export interface StopRow {
  readonly stop_id: string;
  /** A `StopReason` by schema; anything else fails closed. */
  readonly reason: StopReason | (string & {});
  readonly approval_id: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly attempt_id: string | null;
  /** The source attempt, when one with that ID exists. */
  readonly source_account: string | null;
  readonly source_approval: string | null;
  readonly source_provider: string | null;
  readonly source_model: string | null;
  readonly source_pricing: string | null;
}

/** A route an admission asks for: its model is already canonical. */
export interface StopTarget {
  readonly accountId: string;
  readonly approvalId: string;
  readonly provider: string;
  readonly model: string;
}

export type Resolve = (
  provider: string,
  model: string,
  pricingVersion: string | null,
) => string | null;

/**
 * Why a stop row denies `target`, or null when it does not. The causes are for trusted operator
 * diagnostics only; admission reports every one as the fixed `STOPPED` detail.
 */
export type StopCause =
  | 'RECORDED_SCOPE'
  | 'SOURCE_ROUTE'
  | 'MALFORMED_SHAPE'
  | 'SOURCE_MISSING'
  | 'SOURCE_MISMATCH'
  | 'IDENTITY_UNRESOLVED';

/** Whether the reason derives a source route (`OVERRUN`, `DISCREPANCY`). */
export const routeWide = (row: StopRow): boolean =>
  row.reason === 'OVERRUN' || row.reason === 'DISCREPANCY';

/** Whether the row has its reason's accepted shape (the table above). */
export function acceptedShape(row: StopRow): boolean {
  if (routeWide(row)) {
    return (
      row.approval_id !== null &&
      row.provider === null &&
      row.model === null &&
      row.attempt_id !== null
    );
  }
  if (row.reason === 'UNEXPECTED_MODEL') {
    return row.approval_id === null && row.provider !== null && row.model !== null;
  }
  if (row.reason === 'UNVERIFIED_BILLING') {
    return row.approval_id === null && row.provider !== null && row.model === null;
  }
  return false;
}

export function stopCause(row: StopRow, target: StopTarget, resolve: Resolve): StopCause | null {
  if (!acceptedShape(row)) return 'MALFORMED_SHAPE';

  // The recorded predicate, with any recorded model compared canonically.
  let recordedModel = true;
  if (row.model !== null) {
    const canonical = resolve(row.provider ?? target.provider, row.model, null);
    if (canonical === null) return 'IDENTITY_UNRESOLVED';
    recordedModel = canonical === target.model;
  }
  const recorded =
    (row.approval_id === null || row.approval_id === target.approvalId) &&
    (row.provider === null || row.provider === target.provider) &&
    recordedModel;
  if (!routeWide(row)) return recorded ? 'RECORDED_SCOPE' : null;

  // The source route, derived from the immutable source attempt; never narrows the recorded scope.
  if (
    row.source_account === null ||
    row.source_provider === null ||
    row.source_model === null ||
    row.source_pricing === null
  ) {
    return 'SOURCE_MISSING';
  }
  if (row.source_account !== target.accountId || row.source_approval !== row.approval_id) {
    return 'SOURCE_MISMATCH';
  }
  const source = resolve(row.source_provider, row.source_model, row.source_pricing);
  if (source === null) return 'IDENTITY_UNRESOLVED';
  if (recorded) return 'RECORDED_SCOPE';
  return row.source_provider === target.provider && source === target.model ? 'SOURCE_ROUTE' : null;
}

/** Every uncleared stop of one billing account, with its source attempt's immutable fields. */
export async function unclearedStops(db: Queryable, accountId: string): Promise<StopRow[]> {
  const { rows } = await db.query<StopRow>(
    `SELECT s.stop_id::text, s.reason, s.approval_id, s.provider, s.model, s.attempt_id::text,
       a.account_id AS source_account, a.approval_id AS source_approval,
       a.provider AS source_provider, a.model AS source_model, a.pricing_version AS source_pricing
     FROM ltw_ai_stops s LEFT JOIN ltw_ai_attempts a ON a.attempt_id = s.attempt_id
     WHERE s.account_id = $1
       AND NOT EXISTS (SELECT 1 FROM ltw_ai_stop_clearances c WHERE c.stop_id = s.stop_id)
     ORDER BY s.created_at, s.stop_id`,
    [accountId],
  );
  return rows;
}

/** Whether any uncleared stop of the target's account denies it (read under the account lock). */
export async function stopDenies(
  db: Queryable,
  target: StopTarget,
  resolve: Resolve,
): Promise<boolean> {
  const rows = await unclearedStops(db, target.accountId);
  return rows.some((row) => stopCause(row, target, resolve) !== null);
}
