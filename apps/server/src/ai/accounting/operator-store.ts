import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { fixedStep } from './deadline.ts';
import { MAX_MICROS } from './money.ts';
import { readCommitted, type Tx } from './pg-transaction.ts';
import { appendStop, readAttemptCharge, stopForCharge } from './spend.ts';
import { AccountingRejection, type Authorization } from './types.ts';

/**
 * Operator records (docs/STAGE_300_REMEDIATION_DESIGN.md §1–2). Reached only from the operator
 * CLI. Every mutation takes the policy lock exclusively, so no admission, settlement or release
 * runs meanwhile, and appends rows with the owner's recorded authorization. Nothing is updated or
 * deleted; a revision copies what it does not change.
 */
export interface ApprovalCeilings {
  readonly stageMicros: bigint;
  readonly campaignDailyMicros: bigint;
  readonly playSessionMicros: bigint;
  readonly evaluationRunMicros: bigint;
}

export interface BatchEvidence {
  readonly batchId: string;
  readonly accountId: string;
  readonly provider: string;
  readonly model: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly invoicedTotalMicros: bigint;
  readonly evidenceReference: string;
  /** Absolute charge per included attempt. */
  readonly allocations: ReadonlyMap<string, bigint>;
}

const positive = (value: bigint): string => {
  if (value <= 0n || value > MAX_MICROS) throw new AccountingRejection('CEILING_NOT_POSITIVE');
  return value.toString();
};
const nonNegative = (value: bigint): string => {
  if (value < 0n || value > MAX_MICROS) throw new AccountingRejection('INVALID_CHARGE');
  return value.toString();
};
const auth = (a: Authorization): string[] => [a.ownerId, a.authorizedOn, a.source];

export class OperatorStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  #exclusive<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return readCommitted(this.#pool, fixedStep(), async (tx) => {
      await tx.policy('exclusive');
      return work(tx);
    });
  }

  createAccount(input: {
    accountId: string;
    providerAccountRef: string;
    globalDailyCeilingMicros: bigint;
    authorization: Authorization;
  }): Promise<void> {
    return this.#exclusive(async (tx) => {
      await tx.query(
        `INSERT INTO ltw_ai_billing_accounts (account_id, provider_account_ref, owner_id,
           authorized_on, authorization_source) VALUES ($1, $2, $3, $4::date, $5)`,
        [input.accountId, input.providerAccountRef, ...auth(input.authorization)],
      );
      await tx.query(
        `INSERT INTO ltw_ai_account_revisions (account_id, revision, global_daily_ceiling_micros,
           enabled, owner_id, authorized_on, authorization_source)
         VALUES ($1, 1, $2::bigint, true, $3, $4::date, $5)`,
        [input.accountId, positive(input.globalDailyCeilingMicros), ...auth(input.authorization)],
      );
    });
  }

  reviseAccount(input: {
    accountId: string;
    globalDailyCeilingMicros?: bigint;
    enabled?: boolean;
    authorization: Authorization;
  }): Promise<number> {
    return this.#exclusive(async (tx) => {
      const latest = (
        await tx.query<{ revision: number; ceiling: string; enabled: boolean }>(
          `SELECT revision, global_daily_ceiling_micros::text AS ceiling, enabled
           FROM ltw_ai_account_revisions WHERE account_id = $1 ORDER BY revision DESC LIMIT 1`,
          [input.accountId],
        )
      ).rows[0];
      if (latest === undefined) throw new AccountingRejection('UNKNOWN_ACCOUNT');
      const revision = latest.revision + 1;
      await tx.query(
        `INSERT INTO ltw_ai_account_revisions (account_id, revision, global_daily_ceiling_micros,
           enabled, owner_id, authorized_on, authorization_source)
         VALUES ($1, $2, $3::bigint, $4, $5, $6::date, $7)`,
        [
          input.accountId,
          revision,
          positive(input.globalDailyCeilingMicros ?? BigInt(latest.ceiling)),
          input.enabled ?? latest.enabled,
          ...auth(input.authorization),
        ],
      );
      return revision;
    });
  }

  createApproval(input: {
    approvalId: string;
    accountId: string;
    grantReference: string;
    stage: string;
    ceilings: ApprovalCeilings;
    campaignIds: readonly string[];
    authorization: Authorization;
  }): Promise<void> {
    if (input.campaignIds.length === 0) throw new AccountingRejection('NO_CAMPAIGN');
    return this.#exclusive(async (tx) => {
      await tx.query(
        `INSERT INTO ltw_ai_approvals (approval_id, account_id, grant_reference, stage, owner_id,
           authorized_on, authorization_source) VALUES ($1, $2, $3, $4, $5, $6::date, $7)`,
        [
          input.approvalId,
          input.accountId,
          input.grantReference,
          input.stage,
          ...auth(input.authorization),
        ],
      );
      await insertApprovalRevision(tx, input.approvalId, 1, input.grantReference, {
        ceilings: input.ceilings,
        campaignIds: input.campaignIds,
        enabled: true,
        authorization: input.authorization,
      });
    });
  }

  reviseApproval(input: {
    approvalId: string;
    ceilings?: Partial<ApprovalCeilings>;
    campaignIds?: readonly string[];
    enabled?: boolean;
    authorization: Authorization;
  }): Promise<number> {
    return this.#exclusive(async (tx) => {
      const latest = (
        await tx.query<{
          revision: number;
          grant_reference: string;
          stage: string;
          campaign_day: string;
          play: string;
          evaluation: string;
          campaign_ids: string[];
          enabled: boolean;
        }>(
          `SELECT revision, grant_reference, stage_ceiling_micros::text AS stage,
             campaign_daily_ceiling_micros::text AS campaign_day,
             play_session_ceiling_micros::text AS play,
             evaluation_run_ceiling_micros::text AS evaluation, campaign_ids, enabled
           FROM ltw_ai_approval_revisions WHERE approval_id = $1
           ORDER BY revision DESC LIMIT 1`,
          [input.approvalId],
        )
      ).rows[0];
      if (latest === undefined) throw new AccountingRejection('UNKNOWN_APPROVAL');
      const revision = latest.revision + 1;
      await insertApprovalRevision(tx, input.approvalId, revision, latest.grant_reference, {
        ceilings: {
          stageMicros: input.ceilings?.stageMicros ?? BigInt(latest.stage),
          campaignDailyMicros: input.ceilings?.campaignDailyMicros ?? BigInt(latest.campaign_day),
          playSessionMicros: input.ceilings?.playSessionMicros ?? BigInt(latest.play),
          evaluationRunMicros: input.ceilings?.evaluationRunMicros ?? BigInt(latest.evaluation),
        },
        campaignIds: input.campaignIds ?? latest.campaign_ids,
        enabled: input.enabled ?? latest.enabled,
        authorization: input.authorization,
      });
      return revision;
    });
  }

  /** Binds an evaluation run to one of the approval's campaigns, before any admission. */
  registerEvaluationRun(input: {
    runId: string;
    approvalId: string;
    campaignId: string;
    authorization: Authorization;
  }): Promise<void> {
    return this.#exclusive(async (tx) => {
      const bound = (
        await tx.query<{ bound: boolean }>(
          `SELECT $2 = ANY (campaign_ids) AS bound FROM ltw_ai_approval_revisions
           WHERE approval_id = $1 ORDER BY revision DESC LIMIT 1`,
          [input.approvalId, input.campaignId],
        )
      ).rows[0];
      if (bound === undefined) throw new AccountingRejection('UNKNOWN_APPROVAL');
      if (!bound.bound) throw new AccountingRejection('CAMPAIGN_NOT_BOUND');
      await tx.query(
        `INSERT INTO ltw_ai_evaluation_runs (run_id, approval_id, campaign_id, owner_id,
           authorized_on, authorization_source) VALUES ($1, $2, $3, $4, $5::date, $6)`,
        [input.runId, input.approvalId, input.campaignId, ...auth(input.authorization)],
      );
    });
  }

  clearStop(stopId: string, authorization: Authorization): Promise<void> {
    return this.#exclusive(async (tx) => {
      await tx.query(
        `INSERT INTO ltw_ai_stop_clearances (stop_id, owner_id, authorized_on, authorization_source)
         VALUES ($1, $2, $3::date, $4)`,
        [stopId, ...auth(authorization)],
      );
    });
  }

  /**
   * Non-reducing evidence for one attempt, never terminal: an open (crash-held) attempt keeps its
   * hold and counts the larger of hold and evidence; above the bound it stops the approval.
   */
  recordEvidence(input: {
    attemptId: string;
    chargeMicros: bigint;
    authorization: Authorization;
  }): Promise<VerifiedCharge> {
    return this.#exclusive((tx) =>
      appendVerifiedCharge(tx, input.attemptId, input.chargeMicros, null, input.authorization, {
        terminal: false,
      }),
    );
  }

  /**
   * A verified absolute charge for one attempt: terminal if none exists, else evidence. The result
   * names any stop it appended, so the operator can identify the one clearance target (B2).
   */
  reconcileAttempt(input: {
    attemptId: string;
    chargeMicros: bigint;
    authorization: Authorization;
  }): Promise<VerifiedCharge> {
    return this.#exclusive((tx) =>
      appendVerifiedCharge(tx, input.attemptId, input.chargeMicros, null, input.authorization),
    );
  }

  /**
   * Batch evidence: the window must be closed, every attempt of that account/provider/model in it
   * must be included and already resolved, and the absolute allocations must cover the invoice.
   * Each allocation is per attempt, so every campaign/session/stage bucket is attributed.
   *
   * "Resolved" means the attempt already has terminal accounting (a settlement, a proven
   * pre-dispatch release or a per-attempt operator reconciliation). A caller outcome (TIMEOUT,
   * recovery) never proves that a provider attempt finished or that its charge is known, so an
   * attempt without a terminal row rejects the batch and keeps its full hold. A batch therefore
   * only appends non-reducing evidence; it never writes a terminal row.
   */
  recordBatchEvidence(input: BatchEvidence, authorization: Authorization): Promise<string[]> {
    return this.#exclusive(async (tx) => {
      const window = (
        await tx.query<{ closed: boolean; attempts: string[]; unresolved: string[] }>(
          `SELECT clock_timestamp() >= $5::timestamptz AS closed,
             COALESCE(array_agg(a.attempt_id::text), '{}') AS attempts,
             COALESCE(array_agg(a.attempt_id::text) FILTER (WHERE NOT EXISTS (
               SELECT 1 FROM ltw_ai_accounting c
               WHERE c.attempt_id = a.attempt_id AND c.kind <> 'evidence')), '{}') AS unresolved
           FROM ltw_ai_attempts a
           WHERE a.account_id = $1 AND a.provider = $2 AND a.model = $3
             AND a.created_at >= $4::timestamptz AND a.created_at < $5::timestamptz`,
          [input.accountId, input.provider, input.model, input.windowStart, input.windowEnd],
        )
      ).rows[0];
      if (window === undefined || !window.closed) throw new AccountingRejection('WINDOW_OPEN');
      if (window.unresolved.length > 0) throw new AccountingRejection('ATTEMPTS_UNRESOLVED');
      const included = [...input.allocations.keys()].sort();
      if (JSON.stringify(included) !== JSON.stringify([...window.attempts].sort())) {
        throw new AccountingRejection('WINDOW_NOT_COVERED');
      }
      const allocated = [...input.allocations.values()].reduce((sum, value) => sum + value, 0n);
      if (allocated < input.invoicedTotalMicros) {
        throw new AccountingRejection('INVOICE_NOT_ALLOCATED');
      }
      await tx.query(
        `INSERT INTO ltw_ai_evidence_batches (batch_id, account_id, provider, model, window_start,
           window_end, invoiced_total_micros, evidence_reference, owner_id, authorized_on,
           authorization_source)
         VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::bigint, $8, $9, $10::date, $11)`,
        [
          input.batchId,
          input.accountId,
          input.provider,
          input.model,
          input.windowStart,
          input.windowEnd,
          nonNegative(input.invoicedTotalMicros),
          input.evidenceReference,
          ...auth(authorization),
        ],
      );
      const stops: string[] = [];
      for (const [attemptId, charge] of input.allocations) {
        const verified = await appendVerifiedCharge(
          tx,
          attemptId,
          charge,
          input.batchId,
          authorization,
          {
            terminal: false,
          },
        );
        stops.push(...verified.stops);
      }
      return stops;
    });
  }
}

async function insertApprovalRevision(
  tx: Tx,
  approvalId: string,
  revision: number,
  grantReference: string,
  values: {
    ceilings: ApprovalCeilings;
    campaignIds: readonly string[];
    enabled: boolean;
    authorization: Authorization;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO ltw_ai_approval_revisions (approval_id, revision, grant_reference,
       stage_ceiling_micros, campaign_daily_ceiling_micros, play_session_ceiling_micros,
       evaluation_run_ceiling_micros, campaign_ids, enabled, owner_id, authorized_on,
       authorization_source)
     VALUES ($1, $2, $3, $4::bigint, $5::bigint, $6::bigint, $7::bigint, $8, $9, $10, $11::date, $12)`,
    [
      approvalId,
      revision,
      grantReference,
      positive(values.ceilings.stageMicros),
      positive(values.ceilings.campaignDailyMicros),
      positive(values.ceilings.playSessionMicros),
      positive(values.ceilings.evaluationRunMicros),
      values.campaignIds,
      values.enabled,
      ...auth(values.authorization),
    ],
  );
}

/** What a verified charge appended: its row kind and the IDs of any stops it called for. */
export interface VerifiedCharge {
  readonly recorded: 'reconciled' | 'evidence';
  readonly stops: string[];
}

/** Under the exclusive policy lock: no settlement can race this append. */
async function appendVerifiedCharge(
  tx: Tx,
  attemptId: string,
  charge: bigint,
  batchId: string | null,
  authorization: Authorization,
  options: { terminal: boolean } = { terminal: true },
): Promise<VerifiedCharge> {
  const prior = await readAttemptCharge(tx, attemptId);
  if (prior === null) throw new AccountingRejection('UNKNOWN_ATTEMPT');
  const kind = prior.terminal || !options.terminal ? 'evidence' : 'reconciled';
  await tx.query(
    `INSERT INTO ltw_ai_accounting (attempt_id, kind, transition_key, charge_micros, batch_id,
       owner_id, authorized_on, authorization_source)
     VALUES ($1, $2, $3, $4::bigint, $5, $6, $7::date, $8)`,
    [
      attemptId,
      kind,
      `operator:${randomUUID()}`,
      nonNegative(charge),
      batchId,
      ...auth(authorization),
    ],
  );
  const stop = stopForCharge(charge, prior);
  const stops: string[] = [];
  if (stop !== null) {
    const attempt = (
      await tx.query<{ account_id: string; approval_id: string; provider: string; model: string }>(
        'SELECT account_id, approval_id, provider, model FROM ltw_ai_attempts WHERE attempt_id = $1',
        [attemptId],
      )
    ).rows[0];
    if (attempt !== undefined) {
      const stopId = await appendStop(
        tx,
        {
          attemptId,
          accountId: attempt.account_id,
          approvalId: attempt.approval_id,
          provider: attempt.provider,
          model: attempt.model,
        },
        stop,
      );
      stops.push(stopId);
    }
  }
  return { recorded: kind, stops };
}
