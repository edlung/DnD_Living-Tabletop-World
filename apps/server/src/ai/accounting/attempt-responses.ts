import type pg from 'pg';

import { fixedStep } from './deadline.ts';
import { readCommitted } from './pg-transaction.ts';

/**
 * The provider request/message ID of an admitted attempt (migration 0008; docs/adr/0032-live-ai.md,
 * B2 repair 1), for every response that carried one, whatever happened to its usage. One bounded
 * READ COMMITTED insert, idempotent per attempt (a retry after an unconfirmed COMMIT appends
 * nothing). It takes no advisory lock: it holds no charge and is read only by the diagnostic.
 */
export async function recordResponse(
  pool: pg.Pool,
  attemptId: string,
  providerRequestId: string,
  returnedModel: string | null,
): Promise<void> {
  await readCommitted(pool, fixedStep(), async (tx) => {
    await tx.query(
      `INSERT INTO ltw_ai_attempt_responses (attempt_id, provider_request_id, returned_model)
       VALUES ($1, $2, $3) ON CONFLICT (attempt_id) DO NOTHING`,
      [attemptId, providerRequestId, returnedModel],
    );
  });
}
