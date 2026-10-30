import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { ensureManifest } from '../images/postgres-manifests.ts';
import { ensureDraftLocks, controlHead, readDraftLocks } from '../revisions/postgres-helpers.ts';
import { parseCampaignEditSpec } from './edit-spec.ts';
import { checkedEnqueue, digest, jobView, type JobRow } from './postgres-rows.ts';
import type {
  EnqueueEdit,
  EnqueueGeneration,
  GenerationMode,
  GenerationScope,
  JobMutation,
} from './store.ts';

export type PreparedEnqueue = EnqueueGeneration & {
  readonly mode: GenerationMode;
  readonly editSpec: EnqueueEdit['editSpec'] | null;
};
export function checkedJobInput(
  raw: EnqueueGeneration | EnqueueEdit,
  mode: GenerationMode,
): PreparedEnqueue {
  const {
    editSpec,
    mode: ignoredMode,
    ...rest
  } = raw as EnqueueGeneration & Partial<Pick<EnqueueEdit, 'editSpec'>>;
  if (ignoredMode !== undefined && ignoredMode !== mode) throw new Error('INVALID_GENERATION_MODE');
  if ((mode === 'EDIT') !== (editSpec !== undefined)) throw new Error('INVALID_GENERATION_MODE');
  return {
    ...checkedEnqueue(rest),
    mode,
    editSpec: mode === 'EDIT' ? parseCampaignEditSpec(editSpec) : null,
  };
}
export function jobFingerprint(input: PreparedEnqueue, retryOf: string | null) {
  const legacy = { baseRevision: input.basedOnRevision, seed: input.seed, retryOf };
  return digest(
    input.mode === 'EDIT'
      ? {
          ...legacy,
          mode: input.mode,
          editSpec: input.editSpec,
          lockVersion: input.lockVersion ?? 0,
        }
      : (input.lockVersion ?? 0) === 0
        ? legacy
        : { ...legacy, lockVersion: input.lockVersion },
  );
}
export async function insertJob(
  client: pg.PoolClient,
  input: PreparedEnqueue,
  retryOf: string | null,
  nextStep = 0,
  capturedLockVersion = input.lockVersion ?? 0,
): Promise<JobRow> {
  const row = (
    await client.query<JobRow>(
      `INSERT INTO ltw_campaign_generation_jobs
    (job_id,owner_id,draft_id,auth_session_id,request_id,request_fingerprint,base_revision,seed,retry_of,status,next_step,created_at,updated_at,mode,lock_version,edit_spec)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'QUEUED',$10,clock_timestamp(),clock_timestamp(),$11,$12,$13::jsonb) RETURNING *`,
      [
        randomUUID(),
        input.ownerId,
        input.draftId,
        input.authSessionId,
        input.requestId,
        jobFingerprint(input, retryOf),
        input.basedOnRevision,
        JSON.stringify(input.seed),
        retryOf,
        nextStep,
        input.mode,
        capturedLockVersion,
        input.editSpec === null ? null : JSON.stringify(input.editSpec),
      ],
    )
  ).rows[0];
  if (!row) throw new Error('GENERATION_NOT_STORED');
  return row;
}
export async function previous(
  client: pg.PoolClient,
  input: PreparedEnqueue,
  retryOf: string | null,
): Promise<JobMutation | null> {
  const row = (
    await client.query<JobRow>(
      'SELECT * FROM ltw_campaign_generation_jobs WHERE owner_id=$1 AND draft_id=$2 AND request_id=$3',
      [input.ownerId, input.draftId, input.requestId],
    )
  ).rows[0];
  return row
    ? row.mode === input.mode && row.request_fingerprint === jobFingerprint(input, retryOf)
      ? { kind: 'saved', job: jobView(row) }
      : { kind: 'conflict' }
    : null;
}
export async function draftLock(client: pg.PoolClient, scope: GenerationScope): Promise<boolean> {
  return (
    (
      await client.query(
        'SELECT draft_id FROM ltw_workshop_drafts WHERE owner_id=$1 AND draft_id=$2 FOR UPDATE',
        [scope.ownerId, scope.draftId],
      )
    ).rowCount === 1
  );
}
/** Caller holds the owned draft lock. No input can replace the immutable baseline or guard snapshot. */
export async function enqueueContextCurrent(
  client: pg.PoolClient,
  input: PreparedEnqueue,
): Promise<number | null> {
  const head = await controlHead(client, input);
  if ((head?.revision ?? 0) !== input.basedOnRevision) return null;
  if (input.mode === 'GENERATE') {
    const current = (await readDraftLocks(client, input))?.version ?? 0;
    return input.lockVersion === undefined || input.lockVersion === current ? current : null;
  }
  const spec = input.editSpec;
  if (
    !head ||
    !spec ||
    head.digest !== spec.baselineDigest ||
    digest(head.content) !== digest(input.seed) ||
    spec.lockSnapshot.version !== (input.lockVersion ?? 0)
  )
    return null;
  const locks = await ensureDraftLocks(client, input, head);
  const manifest = await ensureManifest(client, input, head);
  return locks.version === spec.lockSnapshot.version &&
    locks.digest === spec.lockSnapshot.digest &&
    manifest.version === spec.manifestVersion &&
    manifest.digest === spec.manifestDigest
    ? locks.version
    : null;
}
