import { createHash } from 'node:crypto';

import type pg from 'pg';

import { fixedStep } from './deadline.ts';
import { scopeBuckets, sortedLockKeys, type AttemptScope } from './lock-keys.ts';
import { MAX_MICROS } from './money.ts';
import { readCommitted, type Tx } from './pg-transaction.ts';
import { appendStop, readAttemptCharge, stopForCharge } from './spend.ts';
import {
  AccountingRejection,
  type ReleaseOutcome,
  type SettlementInput,
  type SettlementOutcome,
  type SuspectReason,
} from './types.ts';

/**
 * Settlement, pre-dispatch release and suspect-output holds (docs/STAGE_300_REMEDIATION_DESIGN.md
 * §1). Each runs in its own READ COMMITTED transaction with a fixed 5,000 ms bound, under the
 * shared policy lock and the attempt's persisted bucket and account-control locks: never the
 * current world snapshot's. Automatic stops are appended in the same transaction, without any lock
 * upgrade. At most one terminal row per attempt; later charges are non-reducing evidence.
 *
 * A settlement's transition key is derived from its whole payload (absolute charge, usage, returned
 * model, provider request ID). An identical repeat, such as a retry after an unconfirmed COMMIT, is
 * a duplicate; a different payload is never discarded but appended as evidence, with the stop its
 * charge calls for.
 */
export interface StoredAttempt extends AttemptScope {
  readonly attemptId: string;
  readonly provider: string;
  readonly model: string;
}

async function lockAttempt(tx: Tx, attemptId: string): Promise<StoredAttempt | null> {
  await tx.policy('shared');
  const row = (
    await tx.query<{
      account_id: string;
      approval_id: string;
      campaign_id: string;
      session_class: 'play' | 'evaluation';
      session_id: string;
      day: string;
      provider: string;
      model: string;
    }>(
      `SELECT account_id, approval_id, campaign_id, session_class, session_id,
         to_char(billing_day, 'YYYY-MM-DD') AS day, provider, model
       FROM ltw_ai_attempts WHERE attempt_id = $1`,
      [attemptId],
    )
  ).rows[0];
  if (row === undefined) return null;
  const attempt: StoredAttempt = {
    attemptId,
    accountId: row.account_id,
    approvalId: row.approval_id,
    campaignId: row.campaign_id,
    sessionClass: row.session_class,
    sessionId: row.session_id,
    day: row.day,
    provider: row.provider,
    model: row.model,
  };
  for (const key of sortedLockKeys(scopeBuckets(attempt))) await tx.lock(key, 'exclusive');
  return attempt;
}

const validCharge = (charge: bigint): void => {
  if (charge < 0n || charge > MAX_MICROS) throw new AccountingRejection('INVALID_CHARGE');
};

/** `settle:<attempt>:<sha256 of the payload>`; usage keys are sorted, so key order is irrelevant. */
export function settlementKey(input: SettlementInput): string {
  const usage =
    input.usage === null
      ? null
      : Object.entries(input.usage).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const payload = JSON.stringify([
    input.chargeMicros.toString(),
    usage,
    input.returnedModel,
    input.providerRequestId,
  ]);
  return `settle:${input.attemptId}:${createHash('sha256').update(payload).digest('hex')}`;
}

export async function settle(pool: pg.Pool, input: SettlementInput): Promise<SettlementOutcome> {
  validCharge(input.chargeMicros);
  return readCommitted(pool, fixedStep(), async (tx) => {
    const attempt = await lockAttempt(tx, input.attemptId);
    if (attempt === null) return 'absent';
    const prior = await readAttemptCharge(tx, input.attemptId);
    if (prior === null) return 'absent';
    const kind = prior.terminal ? 'evidence' : 'settled';
    const inserted = await tx.query(
      `INSERT INTO ltw_ai_accounting
         (attempt_id, kind, transition_key, charge_micros, usage, returned_model, provider_request_id)
       VALUES ($1, $2, $3, $4::bigint, $5::jsonb, $6, $7)
       ON CONFLICT (transition_key) DO NOTHING
       RETURNING entry_id`,
      [
        input.attemptId,
        kind,
        settlementKey(input),
        input.chargeMicros.toString(),
        input.usage === null ? null : JSON.stringify(input.usage),
        input.returnedModel,
        input.providerRequestId,
      ],
    );
    if (inserted.rowCount === 0) return 'duplicate';
    const stop = stopForCharge(input.chargeMicros, prior);
    if (stop !== null) await appendStop(tx, attempt, stop);
    return kind === 'settled' ? 'settled' : 'evidence';
  });
}

/** Only the live process's proof that transport never started may call this; no-op if absent. */
export async function releasePreDispatch(
  pool: pg.Pool,
  attemptId: string,
): Promise<ReleaseOutcome> {
  return readCommitted(pool, fixedStep(), async (tx) => {
    const attempt = await lockAttempt(tx, attemptId);
    if (attempt === null) return 'absent';
    const prior = await readAttemptCharge(tx, attemptId);
    if (prior === null || prior.terminal) return 'already-terminal';
    await tx.query(
      `INSERT INTO ltw_ai_accounting (attempt_id, kind, transition_key, charge_micros)
       VALUES ($1, 'released_pre_dispatch', $2, 0)`,
      [attemptId, `release:${attemptId}`],
    );
    return 'released';
  });
}

/**
 * Unexpected model or unverified billing: the full hold stays and the route is stopped. Idempotent
 * per attempt and reason (B2 repair 1): under the attempt's account lock, a stop this attempt
 * already caused for this reason (committed by an earlier try whose answer was lost, and possibly
 * cleared since) is never appended again, so the write may be retried safely.
 */
export async function holdWithStop(
  pool: pg.Pool,
  attemptId: string,
  reason: SuspectReason,
  returnedModel: string | null,
): Promise<void> {
  await readCommitted(pool, fixedStep(), async (tx) => {
    const attempt = await lockAttempt(tx, attemptId);
    if (attempt === null) throw new AccountingRejection('UNKNOWN_ATTEMPT');
    const existing = await tx.query(
      'SELECT 1 FROM ltw_ai_stops WHERE attempt_id = $1 AND reason = $2',
      [attemptId, reason],
    );
    if (existing.rowCount === 0) await appendStop(tx, attempt, reason, returnedModel);
  });
}

export const SETTLEMENT_RETRY_DELAYS_MS = [100, 500, 2_000] as const;

/**
 * Known usage whose settlement failed: the hold stays and settlement is retried after 100, 500 and
 * 2,000 ms, stopping on success or shutdown. Exhausted retries leave the hold for the operator.
 * The same bounded schedule retries the other idempotent accounting writes of an attempt (its
 * automatic stop, its response record; B2 repair 1). A rejection is final and thrown at once.
 */
export async function settleWithRetry<T = SettlementOutcome>(
  attemptSettle: () => Promise<T>,
  options: {
    readonly shutdown: AbortSignal;
    readonly sleep?: (ms: number) => Promise<void>;
  },
): Promise<T | 'held'> {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const stopping = (): boolean => options.shutdown.aborted;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await attemptSettle();
    } catch (error) {
      if (error instanceof AccountingRejection) throw error;
      const delay = SETTLEMENT_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || stopping()) return 'held';
      await sleep(delay);
      if (stopping()) return 'held';
    }
  }
}
