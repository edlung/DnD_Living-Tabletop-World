import { createHash } from 'node:crypto';

import type pg from 'pg';

import { fixedStep } from '../ai/accounting/deadline.ts';
import { readCommitted, type Tx } from '../ai/accounting/pg-transaction.ts';
import type { Authorization } from '../ai/accounting/types.ts';

/**
 * The image spending ledger (docs/adr/0035-images.md §2; migration 0011_image_budget.sql). Before
 * a provider call a job reserves a worst-case amount against the stored ceiling; afterwards it
 * settles to the provider's reported cost, keeps the whole reservation when the cost is unknown,
 * or releases it when the request was never sent. No stored ceiling, or a ceiling of zero, admits
 * nothing; only the operator CLI stores a ceiling, and no configuration can raise it.
 *
 * Every write runs in one READ COMMITTED transaction under one exclusive advisory lock, so two
 * jobs cannot both pass a nearly full ceiling: the second reads the first's reservation. Money is
 * integer microdollars; history is never updated or deleted.
 */

/** The ledger's lock: a nonnegative 63-bit key, apart from the accounting store's negative keys. */
export const IMAGE_LEDGER_LOCK_KEY =
  createHash('sha256')
    .update(JSON.stringify(['image-ledger']))
    .digest()
    .readBigUInt64BE(0) &
  ((1n << 63n) - 1n);

export type ImageChargeOutcome = 'generated' | 'refused' | 'failed' | 'timeout' | 'not-sent';

export interface ImageCharge {
  /** A fresh UUID per provider call. */
  readonly chargeId: string;
  readonly campaignId: string;
  readonly requestId: string;
  readonly provider: string;
  readonly model: string;
  /** The worst case of one call of this model; positive. */
  readonly reserveMicros: bigint;
}

export interface ImageSettlement {
  readonly outcome: ImageChargeOutcome;
  /** The provider's reported cost, or null when unknown: the whole reservation stays charged. */
  readonly costMicros: bigint | null;
  readonly returnedModel: string | null;
  readonly providerRequestId: string | null;
}

/** `no-budget`: no ceiling is stored; `ceiling`: zero, or this reservation would pass it. */
export type ReserveResult = 'reserved' | 'no-budget' | 'ceiling';

export interface ImageLedger {
  reserve(charge: ImageCharge): Promise<ReserveResult>;
  /** Settles a reservation once; settling it again changes nothing. */
  settle(chargeId: string, settlement: ImageSettlement): Promise<void>;
}

/** Effective spending: each settled charge as settled, each open one at its whole reservation. */
const TOTALS = `
  SELECT
    COALESCE(sum(COALESCE(s.charged_micros, c.reserved_micros)), 0)::text AS spent,
    COALESCE(sum(c.reserved_micros) FILTER (WHERE s.charge_id IS NULL), 0)::text AS held,
    count(*)::int AS charges,
    (count(*) FILTER (WHERE s.charge_id IS NULL))::int AS unsettled
  FROM ltw_image_charges c LEFT JOIN ltw_image_settlements s USING (charge_id)`;

const LATEST = `SELECT revision, ceiling_micros::text AS ceiling
  FROM ltw_image_budget ORDER BY revision DESC LIMIT 1`;

interface Totals {
  readonly spent: string;
  readonly held: string;
  readonly charges: number;
  readonly unsettled: number;
}

async function latestCeiling(tx: Tx): Promise<{ revision: number; ceiling: bigint } | null> {
  const row = (await tx.query<{ revision: number; ceiling: string }>(LATEST)).rows[0];
  return row ? { revision: row.revision, ceiling: BigInt(row.ceiling) } : null;
}

async function totals(tx: Tx): Promise<Totals> {
  const row = (await tx.query<Totals>(TOTALS)).rows[0];
  if (!row) throw new Error('image ledger totals unavailable');
  return row;
}

export class PostgresImageLedger implements ImageLedger {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  reserve(charge: ImageCharge): Promise<ReserveResult> {
    if (charge.reserveMicros <= 0n) return Promise.resolve('ceiling');
    return readCommitted(this.#pool, fixedStep(), async (tx) => {
      await tx.lock(IMAGE_LEDGER_LOCK_KEY, 'exclusive');
      const budget = await latestCeiling(tx);
      if (budget === null) return 'no-budget';
      const spent = BigInt((await totals(tx)).spent);
      if (budget.ceiling === 0n || spent + charge.reserveMicros > budget.ceiling) return 'ceiling';
      await tx.query(
        `INSERT INTO ltw_image_charges
           (charge_id, campaign_id, request_id, provider, model, reserved_micros)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          charge.chargeId,
          charge.campaignId,
          charge.requestId,
          charge.provider,
          charge.model,
          charge.reserveMicros.toString(),
        ],
      );
      return 'reserved';
    });
  }

  settle(chargeId: string, settlement: ImageSettlement): Promise<void> {
    return readCommitted(this.#pool, fixedStep(), async (tx) => {
      await tx.lock(IMAGE_LEDGER_LOCK_KEY, 'exclusive');
      const reserved = (
        await tx.query<{ reserved: string }>(
          'SELECT reserved_micros::text AS reserved FROM ltw_image_charges WHERE charge_id = $1',
          [chargeId],
        )
      ).rows[0];
      if (!reserved) throw new Error('unknown image charge');
      const notSent = settlement.outcome === 'not-sent';
      const reported = !notSent && settlement.costMicros !== null;
      const charged = notSent ? 0n : (settlement.costMicros ?? BigInt(reserved.reserved));
      await tx.query(
        `INSERT INTO ltw_image_settlements
           (charge_id, outcome, charged_micros, cost_reported, returned_model, provider_request_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (charge_id) DO NOTHING`,
        [
          chargeId,
          settlement.outcome,
          charged.toString(),
          reported,
          settlement.returnedModel,
          settlement.providerRequestId,
        ],
      );
    });
  }
}

/**
 * Records a new ceiling (`pnpm ai:operator image-budget-set`); zero stops every image call. The
 * owner's authorization is recorded with it. Returns the new revision.
 */
export function setImageCeiling(
  pool: pg.Pool,
  ceilingMicros: bigint,
  authorization: Authorization,
): Promise<number> {
  return readCommitted(pool, fixedStep(), async (tx) => {
    await tx.lock(IMAGE_LEDGER_LOCK_KEY, 'exclusive');
    const revision = ((await latestCeiling(tx))?.revision ?? 0) + 1;
    await tx.query(
      `INSERT INTO ltw_image_budget
         (revision, ceiling_micros, owner_id, authorized_on, authorization_source)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        revision,
        ceilingMicros.toString(),
        authorization.ownerId,
        authorization.authorizedOn,
        authorization.source,
      ],
    );
    return revision;
  });
}

/** The operator's counters (`pnpm ai:operator status`): amounts as decimal microdollars. */
export interface ImageBudgetStatus {
  readonly revision: number | null;
  readonly ceilingMicros: string | null;
  readonly spentMicros: string;
  /** Reservations not yet settled, counted whole in `spentMicros`. */
  readonly heldMicros: string;
  readonly remainingMicros: string | null;
  readonly charges: number;
  readonly unsettled: number;
}

export function imageBudgetStatus(pool: pg.Pool): Promise<ImageBudgetStatus> {
  return readCommitted(pool, fixedStep(), async (tx) => {
    const budget = await latestCeiling(tx);
    const sums = await totals(tx);
    const spent = BigInt(sums.spent);
    return {
      revision: budget?.revision ?? null,
      ceilingMicros: budget ? budget.ceiling.toString() : null,
      spentMicros: sums.spent,
      heldMicros: sums.held,
      remainingMicros: budget
        ? (budget.ceiling > spent ? budget.ceiling - spent : 0n).toString()
        : null,
      charges: sums.charges,
      unsettled: sums.unsettled,
    };
  });
}
