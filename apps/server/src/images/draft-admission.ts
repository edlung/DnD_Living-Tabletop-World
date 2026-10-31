import type { WorkshopImageSubject } from '@ltw/ai';

import type { Tx } from '../ai/accounting/pg-transaction.ts';

export interface DraftImageClaimBinding {
  readonly input: unknown;
  readonly request_digest: string;
  readonly entity_id: string;
  readonly purpose: string;
  readonly variant: string;
  readonly label: string | null;
}

/** Read-only proof; the actual dispatch gate locks and checks this binding again. */
export async function eligibleDraftImageClaim(
  tx: Pick<Tx, 'query'>,
  subject: WorkshopImageSubject,
  chargeId: string,
  route: { readonly provider: string; readonly model: string },
): Promise<boolean> {
  return (await readDraftImageClaim(tx, subject, chargeId, route)) !== null;
}
export async function readDraftImageClaim(
  tx: Pick<Tx, 'query'>,
  subject: WorkshopImageSubject,
  chargeId: string,
  route: { readonly provider: string; readonly model: string },
): Promise<DraftImageClaimBinding | null> {
  const result = await tx.query<DraftImageClaimBinding>(
    `SELECT j.input,j.request_digest,j.entity_id::text,j.purpose,j.variant,j.label FROM ltw_workshop_image_jobs j
     JOIN ltw_workshop_sessions s ON s.session_id=j.auth_session_id AND s.owner_id=j.owner_id
     WHERE j.owner_id=$1::uuid AND j.draft_id=$2::uuid AND j.job_id=$3::uuid
       AND j.auth_session_id=$4::uuid AND j.worker_id=$5::uuid AND j.fence=$6::bigint
       AND j.charge_id=$7::uuid AND j.provider=$8 AND j.model=$9
       AND j.status='RUNNING' AND j.lease_until>clock_timestamp()
       AND s.revoked_at IS NULL AND s.created_at<=clock_timestamp() AND s.expires_at>clock_timestamp()
       AND NOT EXISTS (SELECT 1 FROM ltw_workshop_image_dispatches d WHERE d.job_id=j.job_id)`,
    [
      subject.ownerId,
      subject.draftId,
      subject.jobId,
      subject.authSessionId,
      subject.workerId,
      subject.fence,
      chargeId,
      route.provider,
      route.model,
    ],
  );
  return result.rows[0] ?? null;
}
