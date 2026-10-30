import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { fixedStep } from './deadline.ts';
import { readCommitted, type Tx } from './pg-transaction.ts';
import { unlimitedText } from './monetary-policy.ts';
import type { Authorization } from './types.ts';

export interface PreparationJobBinding {
  readonly jobId: string;
  readonly ownerId: string;
  readonly draftId: string;
  readonly authSessionId: string;
  readonly fence: string;
}

export async function preparationApprovalAvailable(
  tx: Pick<Tx, 'query'>,
  ownerId: string,
  approvalId: string,
): Promise<boolean> {
  const row = (
    await tx.query<{ account_id: string; enabled: boolean }>(
      `SELECT ap.account_id, (g.enabled AND ar.enabled AND acr.enabled) AS enabled
     FROM ltw_ai_approvals ap
     JOIN LATERAL (SELECT enabled FROM ltw_ai_preparation_grants
       WHERE approval_id = ap.approval_id AND owner_id = $1::uuid ORDER BY revision DESC LIMIT 1) g ON true
     JOIN LATERAL (SELECT enabled FROM ltw_ai_approval_revisions
       WHERE approval_id = ap.approval_id ORDER BY revision DESC LIMIT 1) ar ON true
     JOIN LATERAL (SELECT enabled FROM ltw_ai_account_revisions
       WHERE account_id = ap.account_id ORDER BY revision DESC LIMIT 1) acr ON true
     WHERE ap.approval_id = $2`,
      [ownerId, approvalId],
    )
  ).rows[0];
  return row?.enabled === true && (await unlimitedText(tx, row.account_id));
}

/** Explicit operator-only grant, independent of the approval's legacy campaign bindings. */
export function grantPreparationApproval(
  pool: pg.Pool,
  input: { approvalId: string; ownerId: string; enabled: boolean; authorization: Authorization },
): Promise<number> {
  return readCommitted(pool, fixedStep(), async (tx) => {
    await tx.policy('exclusive');
    const revision =
      ((
        await tx.query<{ revision: number }>(
          'SELECT revision FROM ltw_ai_preparation_grants WHERE approval_id = $1 AND owner_id = $2::uuid ORDER BY revision DESC LIMIT 1',
          [input.approvalId, input.ownerId],
        )
      ).rows[0]?.revision ?? 0) + 1;
    await tx.query(
      `INSERT INTO ltw_ai_preparation_grants
      (approval_id, owner_id, revision, enabled, authorized_by, authorized_on, authorization_source)
      VALUES ($1,$2::uuid,$3,$4,$5,$6::date,$7)`,
      [
        input.approvalId,
        input.ownerId,
        revision,
        input.enabled,
        input.authorization.ownerId,
        input.authorization.authorizedOn,
        input.authorization.source,
      ],
    );
    return revision;
  });
}

/** Check under the accounting transaction. Shared row locks linearize against cancellation/revocation. */
export async function preparationSessionEligible(
  tx: Tx,
  sessionId: string,
  ownerId: string,
  draftId: string,
  approvalId: string,
): Promise<boolean> {
  const row = await tx.query(
    `SELECT ps.preparation_session_id
     FROM ltw_ai_preparation_sessions ps
     JOIN ltw_campaign_generation_jobs j ON j.job_id = ps.job_id
     JOIN ltw_workshop_sessions s ON s.session_id = ps.auth_session_id
     JOIN LATERAL (SELECT enabled FROM ltw_ai_preparation_grants
       WHERE approval_id = ps.approval_id AND owner_id = ps.owner_id ORDER BY revision DESC LIMIT 1) g ON true
     WHERE ps.preparation_session_id = $1::uuid AND ps.owner_id = $2::uuid AND ps.draft_id = $3::uuid
       AND ps.approval_id = $4 AND g.enabled
       AND j.owner_id = ps.owner_id AND j.draft_id = ps.draft_id AND j.auth_session_id = ps.auth_session_id
       AND j.status = 'RUNNING' AND j.fence = ps.job_fence AND j.lease_until > clock_timestamp()
       AND s.owner_id = ps.owner_id AND s.revoked_at IS NULL AND s.created_at <= clock_timestamp()
       AND s.expires_at > clock_timestamp() FOR SHARE OF j, s`,
    [sessionId, ownerId, draftId, approvalId],
  );
  return row.rowCount === 1;
}

export function openPreparationSession(
  pool: pg.Pool,
  binding: PreparationJobBinding,
  approvalId: string,
): Promise<string | null> {
  return readCommitted(pool, fixedStep(), async (tx) => {
    await tx.policy('shared');
    if (!(await preparationApprovalAvailable(tx, binding.ownerId, approvalId))) return null;
    const job = (
      await tx.query<{ revision: number }>(
        `SELECT g.revision FROM ltw_campaign_generation_jobs j
       JOIN ltw_workshop_sessions s ON s.session_id = j.auth_session_id AND s.owner_id = j.owner_id
       JOIN LATERAL (SELECT revision, enabled FROM ltw_ai_preparation_grants
          WHERE approval_id = $5 AND owner_id = j.owner_id ORDER BY revision DESC LIMIT 1) g ON g.enabled
       WHERE j.job_id = $1::uuid AND j.owner_id = $2::uuid AND j.draft_id = $3::uuid
         AND j.fence = $4::bigint AND j.auth_session_id = $6::uuid
         AND j.status = 'RUNNING' AND j.lease_until > clock_timestamp()
         AND s.revoked_at IS NULL AND s.created_at <= clock_timestamp() AND s.expires_at > clock_timestamp()
       FOR SHARE OF j,s`,
        [
          binding.jobId,
          binding.ownerId,
          binding.draftId,
          binding.fence,
          approvalId,
          binding.authSessionId,
        ],
      )
    ).rows[0];
    if (job === undefined) return null;
    await tx.query(
      `INSERT INTO ltw_ai_preparation_sessions
      (preparation_session_id,job_id,owner_id,draft_id,auth_session_id,job_fence,approval_id,grant_revision)
      VALUES ($1,$2,$3,$4,$5,$6::bigint,$7,$8) ON CONFLICT (job_id,job_fence,approval_id) DO NOTHING`,
      [
        randomUUID(),
        binding.jobId,
        binding.ownerId,
        binding.draftId,
        binding.authSessionId,
        binding.fence,
        approvalId,
        job.revision,
      ],
    );
    return (
      (
        await tx.query<{ id: string }>(
          'SELECT preparation_session_id::text AS id FROM ltw_ai_preparation_sessions WHERE job_id=$1 AND job_fence=$2::bigint AND approval_id=$3',
          [binding.jobId, binding.fence, approvalId],
        )
      ).rows[0]?.id ?? null
    );
  });
}
