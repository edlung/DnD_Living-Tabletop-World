import type { AccountingAttemptView, AiAccountingDiagnosticView } from '@ltw/contracts';
import type pg from 'pg';

import { fixedStep } from './accounting/deadline.ts';
import { readCommitted } from './accounting/pg-transaction.ts';

/**
 * The DM's accounting diagnostic of one request (docs/STAGE_300_REMEDIATION_DESIGN.md §2;
 * docs/adr/0032-live-ai.md, B2): read-only, one bounded READ COMMITTED transaction without
 * advisory locks. Only that campaign's request and attempts: no bucket totals, remaining capacity,
 * approvals, stops or another campaign's data. It exists even when the trace never arrived, and
 * marks what is still incomplete; it never invents a record for an unknown ID. An attempt's provider
 * request ID and returned model come from its accounting rows, else from its response record
 * (migration 0008), so an attempt without settled usage still shows them.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface RequestRow {
  campaign_id: string;
  purpose: string;
  capability: string;
  configured_model: string | null;
  created_at: Date;
  deadline_at: Date;
  kind: 'live' | 'recovered_incomplete' | null;
  status: string | null;
  provider: string | null;
  code: string | null;
  trace_recorded: boolean;
}

interface AttemptRow {
  attempt_id: string;
  attempt_kind: AccountingAttemptView['attemptKind'];
  provider: string;
  model: string;
  pricing_version: string;
  reserved: string;
  terminal: 'settled' | 'released_pre_dispatch' | 'reconciled' | null;
  charged: string | null;
  returned_model: string | null;
  provider_request_id: string | null;
}

export function readDiagnostic(
  pool: pg.Pool,
  campaignId: string,
  traceId: string,
): Promise<AiAccountingDiagnosticView | null> {
  // Not a UUID: no request can have it (and the database would refuse the cast).
  if (!UUID.test(traceId)) return Promise.resolve(null);
  return readCommitted(pool, fixedStep(), async (tx) => {
    const request = (
      await tx.query<RequestRow>(
        `SELECT r.campaign_id, r.purpose, r.capability, r.configured_model, r.created_at,
           r.deadline_at, o.kind, o.status, o.provider, o.code,
           EXISTS (SELECT 1 FROM ltw_ai_traces t WHERE t.trace_id = r.request_id::text) AS trace_recorded
         FROM ltw_ai_requests r LEFT JOIN ltw_ai_request_outcomes o USING (request_id)
         WHERE r.request_id = $1::uuid AND r.campaign_id = $2`,
        [traceId, campaignId],
      )
    ).rows[0];
    if (request === undefined) return null;
    const { rows } = await tx.query<AttemptRow>(
      `SELECT a.attempt_id::text, a.attempt_kind, a.provider, a.model, a.pricing_version,
         a.reserved_micros::text AS reserved,
         (SELECT c.kind FROM ltw_ai_accounting c
          WHERE c.attempt_id = a.attempt_id AND c.kind <> 'evidence') AS terminal,
         (SELECT max(c.charge_micros) FROM ltw_ai_accounting c
          WHERE c.attempt_id = a.attempt_id)::text AS charged,
         COALESCE((SELECT c.returned_model FROM ltw_ai_accounting c
          WHERE c.attempt_id = a.attempt_id AND c.returned_model IS NOT NULL
          ORDER BY c.entry_id DESC LIMIT 1), r.returned_model) AS returned_model,
         COALESCE((SELECT c.provider_request_id FROM ltw_ai_accounting c
          WHERE c.attempt_id = a.attempt_id AND c.provider_request_id IS NOT NULL
          ORDER BY c.entry_id DESC LIMIT 1), r.provider_request_id) AS provider_request_id
       FROM ltw_ai_attempts a LEFT JOIN ltw_ai_attempt_responses r USING (attempt_id)
       WHERE a.request_id = $1::uuid AND a.campaign_id = $2
       ORDER BY a.created_at, a.attempt_id`,
      [traceId, campaignId],
    );
    const attempts = rows.map((row): AccountingAttemptView => {
      const reserved = BigInt(row.reserved);
      const charged = row.charged === null ? null : BigInt(row.charged);
      // An open attempt counts the larger of its hold and any evidence; a terminal one its charge.
      const effective =
        row.terminal !== null
          ? (charged ?? 0n)
          : charged !== null && charged > reserved
            ? charged
            : reserved;
      return {
        attemptId: row.attempt_id,
        attemptKind: row.attempt_kind,
        provider: row.provider,
        model: row.model,
        pricingVersion: row.pricing_version,
        reservedMicros: row.reserved,
        accounting: row.terminal ?? 'open',
        effectiveMicros: effective.toString(),
        returnedModel: row.returned_model,
        providerRequestId: row.provider_request_id,
      };
    });
    const lifecycle =
      request.kind === 'live'
        ? 'recorded'
        : request.kind === 'recovered_incomplete'
          ? 'recovered_incomplete'
          : 'pending';
    return {
      traceId,
      campaignId: request.campaign_id,
      purpose: request.purpose,
      capability: request.capability,
      configuredModel: request.configured_model,
      createdAt: request.created_at.toISOString(),
      deadlineAt: request.deadline_at.toISOString(),
      lifecycle,
      callerOutcome:
        request.kind === 'live' && request.status !== null
          ? { status: request.status, provider: request.provider, code: request.code }
          : null,
      traceRecorded: request.trace_recorded,
      incomplete: lifecycle !== 'recorded' || attempts.some((a) => a.accounting === 'open'),
      attempts,
    };
  });
}
