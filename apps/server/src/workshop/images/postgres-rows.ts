import type { AssetMediaType, DraftImageCandidate, DraftImageJob } from '@ltw/contracts';
import type pg from 'pg';

import { draftImageInputSchema } from '../../images/draft-input.ts';
import type {
  DraftImageJobScope,
  DraftImageLease,
  DraftImageScope,
  StoredDraftImageJob,
} from './store.ts';

export type ImageRow = {
  request_id: string;
  expected_manifest_version: number;
  job_id: string;
  owner_id: string;
  draft_id: string;
  auth_session_id: string;
  revision: number;
  package_digest: string;
  entity_id: string;
  purpose: DraftImageJob['purpose'];
  variant: DraftImageJob['variant'];
  label: string | null;
  input: unknown;
  source_signature: string;
  provider: string;
  model: string;
  request_digest: string;
  status: DraftImageJob['status'];
  fence: string;
  worker_id: string | null;
  lease_until: Date | null;
  charge_id: string | null;
  failure_code: string | null;
  created_at: Date;
  updated_at: Date;
  request_fingerprint: string;
};
export const imageKeys = (scope: DraftImageJobScope) => [scope.ownerId, scope.draftId, scope.jobId];
export const IMAGE_PUBLIC_COLUMNS =
  'job_id,revision,entity_id,purpose,variant,label,status,failure_code,created_at,updated_at';
export type PublicImageRow = Pick<
  ImageRow,
  | 'job_id'
  | 'revision'
  | 'entity_id'
  | 'purpose'
  | 'variant'
  | 'label'
  | 'status'
  | 'failure_code'
  | 'created_at'
  | 'updated_at'
>;
export function publicImageJob(row: PublicImageRow): DraftImageJob {
  return {
    jobId: row.job_id,
    revision: row.revision,
    entityId: row.entity_id,
    purpose: row.purpose,
    variant: row.variant,
    label: row.label,
    status: row.status,
    failureCode: row.failure_code,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
export function imageJobView(row: ImageRow): StoredDraftImageJob {
  const input = draftImageInputSchema.parse(row.input);
  if (
    input.subject.entityId !== row.entity_id ||
    input.purpose !== row.purpose ||
    input.variant !== row.variant ||
    input.label !== row.label
  )
    throw new Error('CORRUPT_IMAGE_INPUT');
  return {
    ...publicImageJob(row),
    requestId: row.request_id,
    expectedManifestVersion: row.expected_manifest_version,
    ownerId: row.owner_id,
    draftId: row.draft_id,
    authSessionId: row.auth_session_id,
    input,
    packageDigest: row.package_digest,
    sourceSignature: row.source_signature,
    provider: row.provider,
    model: row.model,
    requestDigest: row.request_digest,
    fence: row.fence,
    workerId: row.worker_id,
    leaseUntil: row.lease_until?.toISOString() ?? null,
    chargeId: row.charge_id,
  };
}
export async function imageTransaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  let client: pg.PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await client.query("SET LOCAL statement_timeout='5s'");
    await client.query("SET LOCAL lock_timeout='5s'");
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch {
    await client?.query('ROLLBACK').catch(() => undefined);
    throw new Error('WORKSHOP_IMAGE_STORAGE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}
export async function imageDraftLock(
  client: pg.PoolClient,
  scope: DraftImageScope,
): Promise<boolean> {
  return (
    (
      await client.query(
        'SELECT draft_id FROM ltw_workshop_drafts WHERE owner_id=$1 AND draft_id=$2 FOR UPDATE',
        [scope.ownerId, scope.draftId],
      )
    ).rowCount === 1
  );
}
export async function imageJob(
  client: pg.PoolClient,
  scope: DraftImageJobScope,
  lock = false,
): Promise<ImageRow | null> {
  return (
    (
      await client.query<ImageRow>(
        `SELECT * FROM ltw_workshop_image_jobs WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3${lock ? ' FOR UPDATE' : ''}`,
        imageKeys(scope),
      )
    ).rows[0] ?? null
  );
}
export async function imageSession(
  client: pg.PoolClient,
  ownerId: string,
  sessionId: string,
  until?: Date | null,
): Promise<boolean> {
  if (until === null) return false;
  return (
    (
      await client.query(
        `SELECT session_id FROM ltw_workshop_sessions WHERE owner_id=$1 AND session_id=$2 AND revoked_at IS NULL
 AND created_at<=clock_timestamp() AND expires_at>clock_timestamp() AND($3::timestamptz IS NULL OR $3>clock_timestamp()) FOR SHARE`,
        [ownerId, sessionId, until ?? null],
      )
    ).rowCount === 1
  );
}
export async function imageLeaseActive(
  client: pg.PoolClient,
  row: ImageRow | null,
  lease: DraftImageLease,
): Promise<boolean> {
  return (
    row !== null &&
    row.status === 'RUNNING' &&
    row.fence === lease.fence &&
    row.worker_id === lease.workerId &&
    row.charge_id === lease.chargeId &&
    row.auth_session_id === lease.authSessionId &&
    (await imageSession(client, row.owner_id, row.auth_session_id, row.lease_until))
  );
}
export type CandidateRow = {
  candidate_id: string;
  job_id: string;
  content_hash: string;
  media_type: AssetMediaType;
  created_at: Date;
  source_revision: number;
  entity_id: string;
  purpose: DraftImageJob['purpose'];
  variant: DraftImageJob['variant'];
  label: string | null;
  source_signature: string;
  reference_hash: string | null;
  provider: string;
  model: string;
};
export const CANDIDATE_SELECT = `SELECT c.candidate_id,c.job_id,c.content_hash,c.media_type,c.created_at,j.revision AS source_revision,j.entity_id,j.purpose,j.variant,j.label,
 j.source_signature,j.input->'reference'->>'contentHash' AS reference_hash,j.provider,j.model FROM ltw_workshop_image_candidates c JOIN ltw_workshop_image_jobs j USING(owner_id,draft_id,job_id)`;
export function candidateView(row: CandidateRow): DraftImageCandidate {
  return {
    candidateId: row.candidate_id,
    jobId: row.job_id,
    sourceRevision: row.source_revision,
    entityId: row.entity_id,
    purpose: row.purpose,
    variant: row.variant,
    label: row.label,
    sourceSignature: row.source_signature,
    referenceHash: row.reference_hash,
    contentHash: row.content_hash,
    mediaType: row.media_type,
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at.toISOString(),
  };
}
export async function imageCandidate(
  client: pg.PoolClient,
  scope: DraftImageScope,
  candidateId: string,
): Promise<DraftImageCandidate | null> {
  const row = (
    await client.query<CandidateRow>(
      `${CANDIDATE_SELECT} WHERE c.owner_id=$1 AND c.draft_id=$2 AND c.candidate_id=$3`,
      [scope.ownerId, scope.draftId, candidateId],
    )
  ).rows[0];
  return row ? candidateView(row) : null;
}
export async function jobCandidate(
  client: pg.PoolClient,
  scope: DraftImageJobScope,
): Promise<DraftImageCandidate | null> {
  const row = (
    await client.query<CandidateRow>(
      `${CANDIDATE_SELECT} WHERE c.owner_id=$1 AND c.draft_id=$2 AND c.job_id=$3`,
      imageKeys(scope),
    )
  ).rows[0];
  return row ? candidateView(row) : null;
}
