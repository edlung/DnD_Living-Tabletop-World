import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { checkContent, contentHashOf } from '../../assets/content-store.ts';
import {
  imageCandidate,
  imageJob,
  imageJobView,
  imageKeys,
  imageLeaseActive,
  imageSession,
  jobCandidate,
  type ImageRow,
} from './postgres-rows.ts';
import type { DraftImageJobScope, DraftImageLease, DraftImageRepository } from './store.ts';

export async function claimImage(
  client: pg.PoolClient,
  scope: DraftImageJobScope,
  workerId: string,
): ReturnType<DraftImageRepository['claim']> {
  const row = await imageJob(client, scope, true);
  if (!row || !['QUEUED', 'RUNNING'].includes(row.status)) return { kind: 'unavailable' };
  if (
    row.status === 'RUNNING' &&
    (
      await client.query<{ active: boolean }>(
        'SELECT $1::timestamptz>clock_timestamp() AS active',
        [row.lease_until],
      )
    ).rows[0]?.active
  )
    return { kind: 'unavailable' };
  const marker =
    (
      await client.query(
        'SELECT job_id FROM ltw_workshop_image_dispatches WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3',
        imageKeys(scope),
      )
    ).rowCount === 1;
  const active = await imageSession(client, row.owner_id, row.auth_session_id);
  if (!active || marker) {
    await client.query(
      `UPDATE ltw_workshop_image_jobs SET status=$4,failure_code=$5,fence=fence+1,lease_until=NULL,updated_at=clock_timestamp()
 WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3`,
      [
        ...imageKeys(scope),
        marker ? 'DISPATCH_UNKNOWN' : 'CANCELLED',
        marker ? 'DISPATCH_UNKNOWN' : 'AUTH_SESSION_ENDED',
      ],
    );
    return { kind: 'unavailable' };
  }
  const claimed = (
    await client.query<ImageRow>(
      `UPDATE ltw_workshop_image_jobs SET status='RUNNING',fence=fence+1,worker_id=$4,charge_id=$5,
 lease_until=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp() WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3 RETURNING *`,
      [...imageKeys(scope), workerId, randomUUID()],
    )
  ).rows[0];
  if (!claimed?.charge_id) throw new Error('IMAGE_CLAIM_NOT_STORED');
  return {
    kind: 'claimed',
    job: imageJobView(claimed),
    lease: {
      ...scope,
      workerId,
      fence: claimed.fence,
      chargeId: claimed.charge_id,
      authSessionId: claimed.auth_session_id,
    },
  };
}
export async function renewImage(client: pg.PoolClient, lease: DraftImageLease): Promise<boolean> {
  const row = await imageJob(client, lease, true);
  if (!(await imageLeaseActive(client, row, lease))) return false;
  await client.query(
    `UPDATE ltw_workshop_image_jobs SET lease_until=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp() WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3`,
    imageKeys(lease),
  );
  return true;
}
export async function beginImageDispatch(
  client: pg.PoolClient,
  lease: DraftImageLease,
  proof: { chargeId: string; requestDigest: string },
): ReturnType<DraftImageRepository['beginDispatch']> {
  const row = await imageJob(client, lease, true);
  if (
    row?.request_digest === proof.requestDigest &&
    row.charge_id === proof.chargeId &&
    row.charge_id === lease.chargeId &&
    row.fence === lease.fence &&
    row.worker_id === lease.workerId &&
    row.auth_session_id === lease.authSessionId &&
    (await jobCandidate(client, lease))
  )
    return 'STORED';
  if (
    !(await imageLeaseActive(client, row, lease)) ||
    row?.request_digest !== proof.requestDigest ||
    lease.chargeId !== proof.chargeId
  )
    return 'FENCED';
  if (
    (
      await client.query(
        'SELECT job_id FROM ltw_workshop_image_dispatches WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3',
        imageKeys(lease),
      )
    ).rowCount
  )
    return 'UNKNOWN';
  await client.query(
    `INSERT INTO ltw_workshop_image_dispatches(owner_id,draft_id,job_id,charge_id,fence,request_digest,dispatched_at)
 VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())`,
    [...imageKeys(lease), lease.chargeId, lease.fence, proof.requestDigest],
  );
  return 'DISPATCH';
}
export async function completeImage(
  client: pg.PoolClient,
  lease: DraftImageLease,
  result: Parameters<DraftImageRepository['complete']>[1],
): ReturnType<DraftImageRepository['complete']> {
  checkContent(result);
  if (!['image/png', 'image/webp'].includes(result.mediaType))
    throw new Error('DRAFT_IMAGE_RASTER_REQUIRED');
  const hash = contentHashOf(result.bytes);
  const row = await imageJob(client, lease, true);
  if (!row) return { kind: 'fenced' };
  const prior = await jobCandidate(client, lease);
  if (
    prior &&
    row.fence === lease.fence &&
    row.worker_id === lease.workerId &&
    row.charge_id === lease.chargeId &&
    row.auth_session_id === lease.authSessionId
  )
    return prior.contentHash === hash &&
      prior.mediaType === result.mediaType &&
      row.model === result.model
      ? { kind: 'stored', candidate: prior }
      : { kind: 'conflict' };
  if (!(await imageLeaseActive(client, row, lease))) return { kind: 'fenced' };
  if (row.model !== result.model) return { kind: 'conflict' };
  if (
    !(
      await client.query(
        'SELECT job_id FROM ltw_workshop_image_dispatches WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3 AND fence=$4 AND charge_id=$5',
        [...imageKeys(lease), lease.fence, lease.chargeId],
      )
    ).rowCount
  )
    return { kind: 'conflict' };
  await client.query(
    `INSERT INTO ltw_workshop_image_contents(owner_id,draft_id,content_hash,media_type,bytes,created_at) VALUES($1,$2,$3,$4,$5,clock_timestamp())
 ON CONFLICT(owner_id,draft_id,content_hash) DO NOTHING`,
    [lease.ownerId, lease.draftId, hash, result.mediaType, Buffer.from(result.bytes)],
  );
  const type = (
    await client.query<{ media_type: string }>(
      'SELECT media_type FROM ltw_workshop_image_contents WHERE owner_id=$1 AND draft_id=$2 AND content_hash=$3',
      [lease.ownerId, lease.draftId, hash],
    )
  ).rows[0]?.media_type;
  if (type !== result.mediaType) throw new Error('IMAGE_CONTENT_TYPE_CONFLICT');
  const candidateId = randomUUID();
  await client.query(
    `INSERT INTO ltw_workshop_image_candidates(candidate_id,owner_id,draft_id,job_id,content_hash,media_type,created_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())`,
    [candidateId, lease.ownerId, lease.draftId, lease.jobId, hash, result.mediaType],
  );
  await client.query(
    `UPDATE ltw_workshop_image_jobs SET status='SUCCEEDED',lease_until=NULL,updated_at=clock_timestamp() WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3`,
    imageKeys(lease),
  );
  const candidate = await imageCandidate(client, lease, candidateId);
  if (!candidate) throw new Error('IMAGE_CANDIDATE_NOT_STORED');
  return { kind: 'stored', candidate };
}
export async function failImage(
  client: pg.PoolClient,
  lease: DraftImageLease,
  code: string,
  uncertain: boolean,
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(code)) throw new Error('INVALID_IMAGE_FAILURE');
  const row = await imageJob(client, lease, true);
  if (!(await imageLeaseActive(client, row, lease))) return false;
  const marker =
    (
      await client.query(
        'SELECT job_id FROM ltw_workshop_image_dispatches WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3',
        imageKeys(lease),
      )
    ).rowCount === 1;
  if (uncertain && !marker) return true;
  await client.query(
    `UPDATE ltw_workshop_image_jobs SET status=$4,failure_code=$5,fence=fence+1,lease_until=NULL,updated_at=clock_timestamp()
 WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3`,
    [...imageKeys(lease), uncertain ? 'DISPATCH_UNKNOWN' : 'FAILED', code],
  );
  return true;
}
