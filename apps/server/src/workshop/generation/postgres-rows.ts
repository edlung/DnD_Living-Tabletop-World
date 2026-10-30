import { createHash } from 'node:crypto';

import {
  campaignPackageSchema,
  workshopIdSchema,
  type CampaignGenerationCandidate,
  type CampaignGenerationJob,
} from '@ltw/contracts';
import type pg from 'pg';
import { z } from 'zod';

import {
  campaignCanonicalJson,
  MAX_CAMPAIGN_PACKAGE_BYTES,
  parseStoredCampaignSource,
} from '../packages/content.ts';
import type {
  EnqueueGeneration,
  GenerationJobScope,
  GenerationLease,
  GenerationStepInput,
  StoredGenerationJob,
  StoredGenerationStep,
} from './store.ts';

export const STAGES = [
  'concept',
  'topology',
  'cast',
  'knowledge',
  'encounters',
  'first-session',
  'outline',
] as const;
export const LEASE_SECONDS = 30;
export type JobRow = {
  job_id: string;
  owner_id: string;
  draft_id: string;
  auth_session_id: string;
  request_id: string;
  request_fingerprint: string;
  base_revision: number;
  seed: unknown;
  retry_of: string | null;
  status: CampaignGenerationJob['status'];
  fence: string;
  worker_id: string | null;
  lease_until: Date | null;
  next_step: number;
  created_at: Date;
  updated_at: Date;
  attached_revision: number | null;
  candidate_available: boolean;
  failure_code: string | null;
};
export type PublicJobRow = Pick<
  JobRow,
  | 'job_id'
  | 'draft_id'
  | 'base_revision'
  | 'status'
  | 'next_step'
  | 'created_at'
  | 'updated_at'
  | 'attached_revision'
  | 'candidate_available'
  | 'failure_code'
>;
export const PUBLIC_JOB_COLUMNS =
  'job_id,draft_id,base_revision,status,next_step,created_at,updated_at,attached_revision,candidate_available,failure_code';
export const keys = (scope: GenerationJobScope) => [scope.ownerId, scope.draftId, scope.jobId];
export const digest = (value: unknown): string =>
  `sha256:${createHash('sha256').update(campaignCanonicalJson(value)).digest('hex')}`;
export function checkedContent(value: unknown) {
  const content = campaignPackageSchema.parse(value);
  if (Buffer.byteLength(campaignCanonicalJson(content)) > MAX_CAMPAIGN_PACKAGE_BYTES)
    throw new Error('INVALID_GENERATION_CONTENT');
  return content;
}
export function checkedEnqueue(value: EnqueueGeneration): EnqueueGeneration {
  const parsed = z
    .object({
      ownerId: workshopIdSchema,
      draftId: workshopIdSchema,
      authSessionId: workshopIdSchema,
      requestId: workshopIdSchema,
      basedOnRevision: z.number().int().min(0).max(999999),
      seed: campaignPackageSchema,
    })
    .strict()
    .parse(value);
  return { ...parsed, seed: checkedContent(parsed.seed) };
}
export function checkedStep(value: GenerationStepInput): GenerationStepInput {
  const parsed = z
    .object({
      ordinal: z.number().int().min(0).max(6),
      input: campaignPackageSchema,
      prompt: z.string().min(1).max(1048576),
      provider: z.string().min(1).max(100),
      model: z.string().min(1).max(200),
      traceId: workshopIdSchema,
    })
    .strict()
    .parse(value);
  return { ...parsed, input: checkedContent(parsed.input) };
}
export function jobView(row: JobRow): StoredGenerationJob {
  return {
    jobId: row.job_id,
    ownerId: row.owner_id,
    draftId: row.draft_id,
    authSessionId: row.auth_session_id,
    requestId: row.request_id,
    seed: checkedContent(row.seed),
    baseRevision: row.base_revision,
    retryOf: row.retry_of,
    status: row.status,
    fence: row.fence,
    workerId: row.worker_id,
    leaseUntil: row.lease_until?.toISOString() ?? null,
    nextStep: row.next_step,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    attachedRevision: row.attached_revision,
    candidateAvailable: row.candidate_available,
    failureCode: row.failure_code,
  };
}
export function publicJob(row: PublicJobRow): CampaignGenerationJob {
  return {
    jobId: row.job_id,
    draftId: row.draft_id,
    baseRevision: row.base_revision,
    status: row.status,
    nextStep: row.next_step,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    attachedRevision: row.attached_revision,
    candidateAvailable: row.candidate_available,
    failureCode: row.failure_code,
  };
}
export async function transaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  let client: pg.PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch {
    await client?.query('ROLLBACK').catch(() => undefined);
    throw new Error('CAMPAIGN_GENERATION_STORAGE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}
export async function loadJob(
  client: pg.PoolClient,
  scope: GenerationJobScope,
  lock = false,
): Promise<JobRow | null> {
  return (
    (
      await client.query<JobRow>(
        `SELECT * FROM ltw_campaign_generation_jobs WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3${lock ? ' FOR UPDATE' : ''}`,
        keys(scope),
      )
    ).rows[0] ?? null
  );
}
/** Share lock serializes dispatch/final attachment with session revocation. */
export async function liveSession(
  client: pg.PoolClient,
  row: Pick<JobRow, 'owner_id' | 'auth_session_id'>,
  leaseUntil?: Date | null,
): Promise<boolean> {
  if (leaseUntil === null) return false;
  const result = await client.query(
    `SELECT session_id FROM ltw_workshop_sessions WHERE owner_id=$1 AND session_id=$2
    AND revoked_at IS NULL AND created_at<=clock_timestamp() AND expires_at>clock_timestamp()
    AND ($3::timestamptz IS NULL OR $3>clock_timestamp()) FOR SHARE`,
    [row.owner_id, row.auth_session_id, leaseUntil ?? null],
  );
  return result.rowCount === 1;
}
export async function activeLease(
  client: pg.PoolClient,
  row: JobRow | null,
  lease: GenerationLease,
): Promise<boolean> {
  return (
    row !== null &&
    row.status === 'RUNNING' &&
    row.worker_id === lease.workerId &&
    row.fence === lease.fence &&
    row.auth_session_id === lease.authSessionId &&
    (await liveSession(client, row, row.lease_until))
  );
}
type StepRow = {
  ordinal: number;
  input: unknown;
  prompt: string;
  provider: string;
  model: string;
  trace_id: string;
  input_digest: string;
  created_at: Date;
  dispatched: boolean;
  content: unknown;
  content_digest: string | null;
  provider_request_id: string | null;
  completed_at: Date | null;
};
export async function loadSteps(
  client: pg.PoolClient,
  scope: GenerationJobScope,
): Promise<readonly StoredGenerationStep[]> {
  const rows = await client.query<StepRow>(
    `SELECT s.*,d.job_id IS NOT NULL AS dispatched,r.content,r.content_digest,r.provider_request_id,r.completed_at
    FROM ltw_campaign_generation_steps s LEFT JOIN ltw_campaign_generation_dispatches d USING(owner_id,draft_id,job_id,ordinal)
    LEFT JOIN ltw_campaign_generation_results r USING(owner_id,draft_id,job_id,ordinal)
    WHERE s.owner_id=$1 AND s.draft_id=$2 AND s.job_id=$3 ORDER BY ordinal`,
    keys(scope),
  );
  return rows.rows.map((row) => {
    const input = checkedContent(row.input);
    if (
      digest({
        ordinal: row.ordinal,
        input,
        prompt: row.prompt,
        provider: row.provider,
        model: row.model,
        traceId: row.trace_id,
      }) !== row.input_digest
    )
      throw new Error('CORRUPT_GENERATION_INPUT');
    const content = row.completed_at === null ? null : checkedContent(row.content);
    if (content !== null && digest(content) !== row.content_digest)
      throw new Error('CORRUPT_GENERATION_OUTPUT');
    return {
      ordinal: row.ordinal,
      stage: STAGES[row.ordinal] ?? '',
      status: row.completed_at !== null ? 'SUCCEEDED' : row.dispatched ? 'DISPATCHING' : 'PREPARED',
      traceId: row.trace_id,
      input,
      prompt: row.prompt,
      inputDigest: row.input_digest,
      provider: row.provider,
      model: row.model,
      content,
      createdAt: row.created_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? null,
      providerRequestId: row.provider_request_id,
    };
  });
}
export async function loadCandidate(
  client: pg.PoolClient,
  scope: GenerationJobScope,
): Promise<CampaignGenerationCandidate | null> {
  const row = (
    await client.query<{
      content: unknown;
      content_digest: string;
      source: unknown;
      created_at: Date;
      base_revision: number;
    }>(
      `SELECT c.*,j.base_revision
    FROM ltw_campaign_generation_candidates c JOIN ltw_campaign_generation_jobs j USING(owner_id,draft_id,job_id)
    WHERE c.owner_id=$1 AND c.draft_id=$2 AND c.job_id=$3`,
      keys(scope),
    )
  ).rows[0];
  if (!row) return null;
  const content = checkedContent(row.content);
  const source = parseStoredCampaignSource(row.source);
  if (
    digest(content) !== row.content_digest ||
    source.kind !== 'AI' ||
    source.jobId !== scope.jobId
  )
    throw new Error('CORRUPT_GENERATION_CANDIDATE');
  return {
    jobId: scope.jobId,
    draftId: scope.draftId,
    baseRevision: row.base_revision,
    content,
    contentDigest: row.content_digest,
    source,
    createdAt: row.created_at.toISOString(),
  };
}
