import type pg from 'pg';

import {
  appendCampaignRevisionInTransaction,
  readCampaignRevisionInTransaction,
} from '../packages/postgres-store.ts';
import { activeLease, digest, keys, loadCandidate, loadJob, loadSteps } from './postgres-rows.ts';
import type { CampaignGenerationRepository, GenerationLease } from './store.ts';

/** Draft→job lock ordering is shared by enqueue/retry; cancellation only takes the job lock. */
export async function finalize(
  client: pg.PoolClient,
  lease: GenerationLease,
): ReturnType<CampaignGenerationRepository['finalize']> {
  if (
    (
      await client.query(
        'SELECT draft_id FROM ltw_workshop_drafts WHERE owner_id=$1 AND draft_id=$2 FOR UPDATE',
        [lease.ownerId, lease.draftId],
      )
    ).rowCount !== 1
  )
    return { kind: 'fenced' };
  const row = await loadJob(client, lease, true);
  if (
    row?.status === 'SUCCEEDED' &&
    row.fence === lease.fence &&
    row.worker_id === lease.workerId &&
    row.auth_session_id === lease.authSessionId
  ) {
    const candidate = await loadCandidate(client, lease);
    if (!candidate) throw new Error('CANDIDATE_NOT_STORED');
    if (row.attached_revision === null) return { kind: 'candidate', candidate };
    const revision = await readCampaignRevisionInTransaction(
      client,
      lease.ownerId,
      lease.draftId,
      row.attached_revision,
    );
    if (!revision) throw new Error('ATTACHED_REVISION_NOT_STORED');
    return { kind: 'attached', revision, candidate };
  }
  if (!(await activeLease(client, row, lease))) return { kind: 'fenced' };
  if (row?.next_step !== 7) return { kind: 'incomplete' };
  const steps = await loadSteps(client, lease);
  const last = steps[6];
  if (
    steps.length !== 7 ||
    steps.some((step, index) => step.ordinal !== index || step.status !== 'SUCCEEDED') ||
    !last?.content ||
    !last.provider ||
    !last.model
  )
    return { kind: 'incomplete' };
  const source = {
    kind: 'AI' as const,
    jobId: lease.jobId,
    traceId: last.traceId,
    provider: last.provider,
    model: last.model,
  };
  await client.query(
    `INSERT INTO ltw_campaign_generation_candidates(owner_id,draft_id,job_id,content,content_digest,source,created_at)
    VALUES($1,$2,$3,$4::jsonb,$5,$6::jsonb,clock_timestamp())`,
    [...keys(lease), JSON.stringify(last.content), digest(last.content), JSON.stringify(source)],
  );
  const candidate = await loadCandidate(client, lease);
  if (!candidate) throw new Error('CANDIDATE_NOT_STORED');
  const result = await appendCampaignRevisionInTransaction(client, {
    ownerId: lease.ownerId,
    draftId: lease.draftId,
    requestId: lease.jobId,
    basedOnRevision: row.base_revision,
    content: candidate.content,
    source,
    createdAt: candidate.createdAt,
  });
  // Expiry while storing a large package rolls back candidate and revision together.
  if (!(await activeLease(client, row, lease))) throw new Error('FINALIZE_LEASE_EXPIRED');
  const attached = result.kind === 'saved' ? result.revision : null;
  await client.query(
    `UPDATE ltw_campaign_generation_jobs SET status='SUCCEEDED',candidate_available=true,attached_revision=$4,lease_until=NULL,updated_at=clock_timestamp()
    WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3`,
    [...keys(lease), attached?.revision ?? null],
  );
  return attached
    ? { kind: 'attached', revision: attached, candidate }
    : { kind: 'candidate', candidate };
}
