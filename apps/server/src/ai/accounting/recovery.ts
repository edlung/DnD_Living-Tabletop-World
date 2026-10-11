import type pg from 'pg';

import { StorageUnavailable } from './pg-transaction.ts';
import { incompleteRequests, recoverRequest } from './request-journal.ts';

/**
 * Accounting recovery service (docs/STAGE_300_REMEDIATION_DESIGN.md §2). Run only by the operator
 * CLI's `recover-incomplete` command: never from an HTTP handler or a background schedule, and
 * never at startup, which only reports. Each request is its own bounded transaction; one that is
 * busy (a slow live finalizer holding its lock) is left for a later sweep. Holds are preserved.
 */
export interface RecoverySummary {
  readonly recovered: number;
  readonly notEligible: number;
  readonly retryLater: number;
}

export async function recoverIncomplete(pool: pg.Pool): Promise<RecoverySummary> {
  let recovered = 0;
  let notEligible = 0;
  let retryLater = 0;
  for (const requestId of await incompleteRequests(pool)) {
    try {
      if ((await recoverRequest(pool, requestId)) === 'recovered') recovered += 1;
      else notEligible += 1;
    } catch (error) {
      if (!(error instanceof StorageUnavailable)) throw error;
      retryLater += 1;
    }
  }
  return { recovered, notEligible, retryLater };
}
