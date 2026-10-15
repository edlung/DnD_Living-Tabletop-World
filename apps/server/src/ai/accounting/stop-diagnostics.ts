import type pg from 'pg';

import { fixedStep } from './deadline.ts';
import { readCommitted } from './pg-transaction.ts';
import { acceptedShape, routeWide, unclearedStops, type Resolve } from './stop-scope.ts';

/**
 * Trusted operator diagnostics of uncleared stops (`pnpm ai:operator stops --account <id>`;
 * docs/adr/0032-live-ai.md, B2). For the operator deciding on a clearance only: never served over
 * HTTP or shown to a campaign, whose callers see only the fixed `ADMISSION_DISABLED`/`STOPPED`
 * denial. Read-only, without advisory locks, in one bounded READ COMMITTED transaction.
 *
 * `restricts` is what admission denies while the stop stands: `approval` (every route of the
 * recorded approval), `route` (the account's provider/model on every approval), `provider`
 * (provider-wide), or `account` (every remote route of the account: malformed shape, missing or
 * mismatched source attempt, or unresolved identity).
 */
export interface StopExplanation {
  readonly stopId: string;
  readonly reason: string;
  readonly approvalId: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly sourceAttempt: string | null;
  readonly shape: 'accepted' | 'malformed';
  readonly source: 'consistent' | 'missing' | 'mismatch' | 'not-consulted';
  /** The canonical model the stop matches; null when none is recorded or derived. */
  readonly canonicalModel: string | null;
  readonly identity: 'resolved' | 'unresolved' | 'not-needed';
  readonly restricts: readonly ('approval' | 'route' | 'provider' | 'account')[];
}

export function explainStops(
  pool: pg.Pool,
  accountId: string,
  resolve: Resolve,
): Promise<StopExplanation[]> {
  return readCommitted(pool, fixedStep(), async (tx) =>
    (await unclearedStops(tx, accountId)).map((row): StopExplanation => {
      const base = {
        stopId: row.stop_id,
        reason: row.reason,
        approvalId: row.approval_id,
        provider: row.provider,
        model: row.model,
        sourceAttempt: row.attempt_id,
      };
      if (!acceptedShape(row)) {
        return {
          ...base,
          shape: 'malformed',
          source: 'not-consulted',
          canonicalModel: null,
          identity: 'not-needed',
          restricts: ['account'],
        };
      }
      if (!routeWide(row)) {
        const canonical = row.model === null ? null : resolve(row.provider ?? '', row.model, null);
        const unresolved = row.model !== null && canonical === null;
        return {
          ...base,
          shape: 'accepted',
          source: 'not-consulted',
          canonicalModel: canonical,
          identity: row.model === null ? 'not-needed' : unresolved ? 'unresolved' : 'resolved',
          restricts: unresolved ? ['account'] : row.model === null ? ['provider'] : ['route'],
        };
      }
      const missing = [
        row.source_account,
        row.source_provider,
        row.source_model,
        row.source_pricing,
      ];
      if (missing.some((field) => field === null)) {
        return {
          ...base,
          shape: 'accepted',
          source: 'missing',
          canonicalModel: null,
          identity: 'not-needed',
          restricts: ['account'],
        };
      }
      if (row.source_account !== accountId || row.source_approval !== row.approval_id) {
        return {
          ...base,
          shape: 'accepted',
          source: 'mismatch',
          canonicalModel: null,
          identity: 'not-needed',
          restricts: ['account'],
        };
      }
      const canonical = resolve(
        row.source_provider ?? '',
        row.source_model ?? '',
        row.source_pricing,
      );
      return {
        ...base,
        shape: 'accepted',
        source: 'consistent',
        canonicalModel: canonical,
        identity: canonical === null ? 'unresolved' : 'resolved',
        restricts: canonical === null ? ['account'] : ['approval', 'route'],
      };
    }),
  );
}
