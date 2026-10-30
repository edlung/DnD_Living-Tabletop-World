import type pg from 'pg';
import type { WorkshopImageSubject } from '@ltw/ai';

import { fixedStep } from '../ai/accounting/deadline.ts';
import { readCommitted, type Tx } from '../ai/accounting/pg-transaction.ts';
import { AccountingRejection, type Authorization } from '../ai/accounting/types.ts';
import { MAX_ASSET_TIMEOUT_MS } from '../platform/config/config.ts';
import { IMAGE_LEDGER_LOCK_KEY, type ImageChargeOutcome } from './ledger.ts';

/**
 * The operator's view and repair of the image ledger (docs/adr/0035-images.md, amendment
 * 2026-10-16; migration 0012). A job that stopped between its reservation and its settlement (a
 * crash, a killed process; the restarted worker runs the job again under a new reservation) leaves
 * an orphaned reservation, counted whole against the ceiling. The operator lists them
 * (`pnpm ai:operator image-reservations`) and closes one with the owner's recorded authorization
 * (`image-reservation-settle`): at the whole reservation, treated as spent, unless they record the
 * amount the provider's own records show. Amounts are decimal microdollars; nothing is updated or
 * deleted.
 */

/**
 * A reservation younger than this may belong to a job still running, which settles it itself: the
 * longest generation bound plus a margin for re-encoding and the settlement's own write.
 */
export const ORPHAN_AFTER_MINUTES = Math.ceil(MAX_ASSET_TIMEOUT_MS / 60_000) + 5;

/** An unsettled reservation: its whole amount still counts as spent. */
export interface OpenImageReservation {
  readonly chargeId: string;
  readonly campaignId: string | null;
  readonly subject?: WorkshopImageSubject;
  readonly requestId: string;
  readonly provider: string;
  readonly model: string;
  readonly reservedMicros: string;
  readonly createdAt: string;
  /** Whole minutes since the reservation, by the database clock. */
  readonly ageMinutes: number;
}

interface OpenRow {
  readonly charge_id: string;
  readonly campaign_id: string | null;
  readonly workshop_owner_id: string | null;
  readonly workshop_draft_id: string | null;
  readonly workshop_job_id: string | null;
  readonly workshop_auth_session_id: string | null;
  readonly workshop_worker_id: string | null;
  readonly workshop_fence: string | null;
  readonly request_id: string;
  readonly provider: string;
  readonly model: string;
  readonly reserved: string;
  readonly created_at: Date;
  readonly age_minutes: number;
}

const OPEN_RESERVATIONS = `SELECT c.charge_id::text AS charge_id, c.campaign_id, c.request_id,
    c.workshop_owner_id::text,c.workshop_draft_id::text,c.workshop_job_id::text,
    c.workshop_auth_session_id::text,c.workshop_worker_id::text,c.workshop_fence::text,
    c.provider, c.model, c.reserved_micros::text AS reserved, c.created_at,
    floor(extract(epoch FROM clock_timestamp() - c.created_at) / 60)::int AS age_minutes
  FROM ltw_image_charges c LEFT JOIN ltw_image_settlements s USING (charge_id)
  WHERE s.charge_id IS NULL
    AND c.created_at <= clock_timestamp() - make_interval(mins => $1::int)
  ORDER BY c.created_at, c.charge_id`;

/** Unsettled reservations made more than `olderThanMinutes` ago, oldest first. */
export async function openImageReservations(
  pool: pg.Pool,
  olderThanMinutes: number,
): Promise<OpenImageReservation[]> {
  return (await pool.query<OpenRow>(OPEN_RESERVATIONS, [olderThanMinutes])).rows.map(toOpen);
}

/** The same within the caller's transaction (`ai:operator spend`, `spend-report.ts`). */
export async function readOpenImageReservations(
  tx: Pick<Tx, 'query'>,
  olderThanMinutes: number,
): Promise<OpenImageReservation[]> {
  return (await tx.query<OpenRow>(OPEN_RESERVATIONS, [olderThanMinutes])).rows.map(toOpen);
}

function toOpen(row: OpenRow): OpenImageReservation {
  return {
    chargeId: row.charge_id,
    campaignId: row.campaign_id,
    ...(row.workshop_owner_id !== null &&
    row.workshop_draft_id !== null &&
    row.workshop_job_id !== null &&
    row.workshop_auth_session_id !== null &&
    row.workshop_worker_id !== null &&
    row.workshop_fence !== null
      ? {
          subject: {
            kind: 'workshop' as const,
            ownerId: row.workshop_owner_id,
            draftId: row.workshop_draft_id,
            jobId: row.workshop_job_id,
            authSessionId: row.workshop_auth_session_id,
            workerId: row.workshop_worker_id,
            fence: row.workshop_fence,
          },
        }
      : {}),
    requestId: row.request_id,
    provider: row.provider,
    model: row.model,
    reservedMicros: row.reserved,
    createdAt: row.created_at.toISOString(),
    ageMinutes: row.age_minutes,
  };
}

export type ImageSettlementOutcome = ImageChargeOutcome | 'orphaned';

/** One reservation of an asset request and how it was settled, if it was. */
export interface ImageChargeRecord {
  readonly chargeId: string;
  readonly provider: string;
  readonly model: string;
  readonly reservedMicros: string;
  readonly createdAt: string;
  readonly settlement: {
    readonly outcome: ImageSettlementOutcome;
    readonly chargedMicros: string;
    /** Whether the amount is the provider's own report (else the whole reservation, or the operator's). */
    readonly costReported: boolean;
    readonly returnedModel: string | null;
    readonly providerRequestId: string | null;
    readonly settledAt: string;
    /** The owner's authorization of an operator settlement (`orphaned`). */
    readonly authorization: Authorization | null;
  } | null;
}

interface ChargeRow {
  readonly charge_id: string;
  readonly provider: string;
  readonly model: string;
  readonly reserved: string;
  readonly created_at: Date;
  readonly outcome: ImageSettlementOutcome | null;
  readonly charged: string | null;
  readonly cost_reported: boolean | null;
  readonly returned_model: string | null;
  readonly provider_request_id: string | null;
  readonly settled_at: Date | null;
  readonly owner_id: string | null;
  readonly authorized_on: string | null;
  readonly authorization_source: string | null;
}

/** Every reservation one asset request's jobs made, oldest first (the live image smoke reads it). */
export async function imageChargesFor(
  pool: pg.Pool,
  campaignId: string,
  requestId: string,
): Promise<ImageChargeRecord[]> {
  const rows = await pool.query<ChargeRow>(
    `SELECT c.charge_id::text AS charge_id, c.provider, c.model,
            c.reserved_micros::text AS reserved, c.created_at,
            s.outcome, s.charged_micros::text AS charged, s.cost_reported, s.returned_model,
            s.provider_request_id, s.created_at AS settled_at,
            o.owner_id, o.authorized_on::text AS authorized_on, o.authorization_source
     FROM ltw_image_charges c
     LEFT JOIN ltw_image_settlements s USING (charge_id)
     LEFT JOIN ltw_image_operator_settlements o USING (charge_id)
     WHERE c.campaign_id = $1 AND c.request_id = $2
     ORDER BY c.created_at, c.charge_id`,
    [campaignId, requestId],
  );
  return rows.rows.map((row) => ({
    chargeId: row.charge_id,
    provider: row.provider,
    model: row.model,
    reservedMicros: row.reserved,
    createdAt: row.created_at.toISOString(),
    settlement:
      row.outcome === null || row.charged === null || row.settled_at === null
        ? null
        : {
            outcome: row.outcome,
            chargedMicros: row.charged,
            costReported: row.cost_reported === true,
            returnedModel: row.returned_model,
            providerRequestId: row.provider_request_id,
            settledAt: row.settled_at.toISOString(),
            authorization:
              row.owner_id === null ||
              row.authorized_on === null ||
              row.authorization_source === null
                ? null
                : {
                    ownerId: row.owner_id,
                    authorizedOn: row.authorized_on,
                    source: row.authorization_source,
                  },
          },
  }));
}

export interface OrphanSettlement {
  readonly chargeId: string;
  readonly reservedMicros: string;
  readonly chargedMicros: string;
}

/**
 * Closes one orphaned reservation (`pnpm ai:operator image-reservation-settle`) under the ledger's
 * exclusive lock: at `chargeMicros`, or the whole reservation when it is null. Refused for an
 * unknown or already settled reservation, and for one younger than `ORPHAN_AFTER_MINUTES`, whose
 * job may still settle it with the provider's reported cost.
 */
export function settleOrphanedReservation(
  pool: pg.Pool,
  input: {
    readonly chargeId: string;
    readonly chargeMicros: bigint | null;
    readonly authorization: Authorization;
  },
): Promise<OrphanSettlement> {
  return readCommitted(pool, fixedStep(), async (tx) => {
    await tx.lock(IMAGE_LEDGER_LOCK_KEY, 'exclusive');
    const found = (
      await tx.query<{ reserved: string; settled: boolean; recent: boolean }>(
        `SELECT c.reserved_micros::text AS reserved, s.charge_id IS NOT NULL AS settled,
                c.created_at > clock_timestamp() - make_interval(mins => $2::int) AS recent
         FROM ltw_image_charges c LEFT JOIN ltw_image_settlements s USING (charge_id)
         WHERE c.charge_id = $1::uuid`,
        [input.chargeId, ORPHAN_AFTER_MINUTES],
      )
    ).rows[0];
    if (!found) throw new AccountingRejection('UNKNOWN_RESERVATION');
    if (found.settled) throw new AccountingRejection('ALREADY_SETTLED');
    if (found.recent) throw new AccountingRejection('RESERVATION_TOO_RECENT');
    const charged = input.chargeMicros ?? BigInt(found.reserved);
    await tx.query(
      `INSERT INTO ltw_image_settlements (charge_id, outcome, charged_micros, cost_reported)
       VALUES ($1::uuid, 'orphaned', $2::bigint, false)`,
      [input.chargeId, charged.toString()],
    );
    await tx.query(
      `INSERT INTO ltw_image_operator_settlements
         (charge_id, owner_id, authorized_on, authorization_source)
       VALUES ($1::uuid, $2, $3::date, $4)`,
      [
        input.chargeId,
        input.authorization.ownerId,
        input.authorization.authorizedOn,
        input.authorization.source,
      ],
    );
    return {
      chargeId: input.chargeId,
      reservedMicros: found.reserved,
      chargedMicros: charged.toString(),
    };
  });
}
