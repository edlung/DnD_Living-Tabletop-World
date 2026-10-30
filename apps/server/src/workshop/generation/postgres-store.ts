import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { workshopIdSchema, type CampaignGenerationJob } from '@ltw/contracts';
import {
  activeLease,
  checkedEnqueue,
  digest,
  jobView,
  keys,
  LEASE_SECONDS,
  liveSession,
  loadCandidate,
  loadJob,
  loadSteps,
  publicJob,
  transaction,
  type JobRow,
  type PublicJobRow,
  PUBLIC_JOB_COLUMNS,
} from './postgres-rows.ts';
import { loadProgress } from './postgres-progress.ts';
import { prepareStep, beginDispatch, completeStep } from './postgres-steps.ts';
import { finalize } from './postgres-finalize.ts';
import type {
  CampaignGenerationRepository,
  EnqueueGeneration,
  GenerationJobScope,
  GenerationLease,
  GenerationScope,
  GenerationStepInput,
  JobMutation,
} from './store.ts';

const bounded = (limit: number) => Math.min(50, Math.max(1, Math.trunc(limit)));
async function insertJob(
  client: pg.PoolClient,
  input: EnqueueGeneration,
  retryOf: string | null,
  nextStep = 0,
): Promise<JobRow> {
  const row = (
    await client.query<JobRow>(
      `INSERT INTO ltw_campaign_generation_jobs
    (job_id,owner_id,draft_id,auth_session_id,request_id,request_fingerprint,base_revision,seed,retry_of,status,next_step,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'QUEUED',$10,clock_timestamp(),clock_timestamp()) RETURNING *`,
      [
        randomUUID(),
        input.ownerId,
        input.draftId,
        input.authSessionId,
        input.requestId,
        digest({ baseRevision: input.basedOnRevision, seed: input.seed, retryOf }),
        input.basedOnRevision,
        JSON.stringify(input.seed),
        retryOf,
        nextStep,
      ],
    )
  ).rows[0];
  if (!row) throw new Error('GENERATION_NOT_STORED');
  return row;
}
async function previous(
  client: pg.PoolClient,
  input: EnqueueGeneration,
  retryOf: string | null,
): Promise<JobMutation | null> {
  const row = (
    await client.query<JobRow>(
      'SELECT * FROM ltw_campaign_generation_jobs WHERE owner_id=$1 AND draft_id=$2 AND request_id=$3',
      [input.ownerId, input.draftId, input.requestId],
    )
  ).rows[0];
  return row
    ? row.request_fingerprint ===
      digest({ baseRevision: input.basedOnRevision, seed: input.seed, retryOf })
      ? { kind: 'saved', job: jobView(row) }
      : { kind: 'conflict' }
    : null;
}
async function draftLock(client: pg.PoolClient, scope: GenerationScope): Promise<boolean> {
  return (
    (
      await client.query(
        'SELECT draft_id FROM ltw_workshop_drafts WHERE owner_id=$1 AND draft_id=$2 FOR UPDATE',
        [scope.ownerId, scope.draftId],
      )
    ).rowCount === 1
  );
}

/** Every mutation is a short transaction. The provider is never called by this repository. */
export class PostgresCampaignGenerationRepository implements CampaignGenerationRepository {
  readonly #pool: pg.Pool;
  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }
  enqueue(raw: EnqueueGeneration): Promise<JobMutation> {
    const input = checkedEnqueue(raw);
    return transaction(this.#pool, async (client) => {
      if (!(await draftLock(client, input))) return { kind: 'not-found' };
      if (
        !(await liveSession(client, {
          owner_id: input.ownerId,
          auth_session_id: input.authSessionId,
        }))
      )
        return { kind: 'conflict' };
      const old = await previous(client, input, null);
      if (old) return old;
      const head =
        (
          await client.query<{ revision: number }>(
            'SELECT revision FROM ltw_campaign_package_revisions WHERE owner_id=$1 AND draft_id=$2 ORDER BY revision DESC LIMIT 1',
            [input.ownerId, input.draftId],
          )
        ).rows[0]?.revision ?? 0;
      if (head !== input.basedOnRevision) return { kind: 'conflict' };
      return { kind: 'saved', job: jobView(await insertJob(client, input, null)) };
    });
  }
  retry(scope: GenerationJobScope, requestId: string, authSessionId: string): Promise<JobMutation> {
    workshopIdSchema.parse(requestId);
    workshopIdSchema.parse(authSessionId);
    return transaction(this.#pool, async (client) => {
      if (!(await draftLock(client, scope))) return { kind: 'not-found' };
      const parent = await loadJob(client, scope, true);
      if (!parent) return { kind: 'not-found' };
      if (!(await liveSession(client, { owner_id: scope.ownerId, auth_session_id: authSessionId })))
        return { kind: 'conflict' };
      const input: EnqueueGeneration = {
        ...scope,
        requestId,
        authSessionId,
        basedOnRevision: parent.base_revision,
        seed: jobView(parent).seed,
      };
      const old = await previous(client, input, scope.jobId);
      if (old) return old;
      if (parent.status !== 'FAILED') return { kind: 'conflict' };
      const steps = await loadSteps(client, scope);
      if (steps.filter((step) => step.status === 'SUCCEEDED').length !== parent.next_step)
        throw new Error('CORRUPT_GENERATION_STEPS');
      const child = await insertJob(client, input, scope.jobId, parent.next_step);
      for (const [table, columns] of [
        ['steps', 'ordinal,input,prompt,provider,model,trace_id,input_digest,created_at'],
        ['dispatches', 'ordinal,fence,dispatched_at'],
        ['results', 'ordinal,content,content_digest,provider_request_id,completed_at'],
      ] as const)
        await client.query(
          `INSERT INTO ltw_campaign_generation_${table}(owner_id,draft_id,job_id,${columns})
        SELECT owner_id,draft_id,$4,${columns} FROM ltw_campaign_generation_${table}
        WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3 AND ordinal<$5`,
          [...keys(scope), child.job_id, parent.next_step],
        );
      return { kind: 'saved', job: jobView(child) };
    });
  }
  get(scope: GenerationJobScope) {
    return transaction(this.#pool, async (client) => {
      const row = await loadJob(client, scope);
      return row ? jobView(row) : null;
    });
  }
  progress(scope: GenerationJobScope) {
    return transaction(this.#pool, (client) => loadProgress(client, scope));
  }
  list(
    scope: GenerationScope,
    limit: number,
    before?: Pick<CampaignGenerationJob, 'createdAt' | 'jobId'> | null,
  ) {
    return transaction(this.#pool, async (client) => {
      const rows = await client.query<PublicJobRow>(
        `SELECT ${PUBLIC_JOB_COLUMNS} FROM ltw_campaign_generation_jobs WHERE owner_id=$1 AND draft_id=$2 AND ($4::timestamptz IS NULL OR (created_at,job_id)<($4::timestamptz,$5::uuid)) ORDER BY created_at DESC,job_id DESC LIMIT $3`,
        [
          scope.ownerId,
          scope.draftId,
          bounded(limit),
          before?.createdAt ?? null,
          before?.jobId ?? null,
        ],
      );
      return rows.rows.map(publicJob);
    });
  }
  pending(limit: number) {
    return transaction(this.#pool, async (client) => {
      const rows = await client.query<{ owner_id: string; draft_id: string; job_id: string }>(
        `SELECT owner_id,draft_id,job_id FROM ltw_campaign_generation_jobs
      WHERE status='QUEUED' OR (status='RUNNING' AND lease_until<=clock_timestamp()) ORDER BY created_at,job_id LIMIT $1`,
        [bounded(limit)],
      );
      return rows.rows.map((row) => ({
        ownerId: row.owner_id,
        draftId: row.draft_id,
        jobId: row.job_id,
      }));
    });
  }
  steps(scope: GenerationJobScope) {
    return transaction(this.#pool, (client) => loadSteps(client, scope));
  }
  candidate(scope: GenerationJobScope) {
    return transaction(this.#pool, (client) => loadCandidate(client, scope));
  }
  claim(scope: GenerationJobScope, workerId: string) {
    workshopIdSchema.parse(workerId);
    return transaction(this.#pool, async (client) => {
      const row = await loadJob(client, scope, true);
      if (!row || (row.status !== 'QUEUED' && row.status !== 'RUNNING'))
        return { kind: 'unavailable' } as const;
      if (
        row.status === 'RUNNING' &&
        (
          await client.query<{ active: boolean }>(
            'SELECT $1::timestamptz>clock_timestamp() AS active',
            [row.lease_until],
          )
        ).rows[0]?.active
      )
        return { kind: 'unavailable' } as const;
      const session = await liveSession(client, row);
      const uncertain =
        row.status === 'RUNNING' &&
        (await loadSteps(client, scope)).some(
          (step) => step.ordinal === row.next_step && step.status === 'DISPATCHING',
        );
      if (!session || uncertain) {
        await client.query(
          `UPDATE ltw_campaign_generation_jobs SET status=$4,failure_code=$5,fence=fence+1,lease_until=NULL,updated_at=clock_timestamp()
          WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3`,
          [
            ...keys(scope),
            uncertain ? 'DISPATCH_UNKNOWN' : 'CANCELLED',
            uncertain ? 'DISPATCH_UNKNOWN' : 'AUTH_SESSION_ENDED',
          ],
        );
        return { kind: 'unavailable' } as const;
      }
      const claimed = (
        await client.query<JobRow>(
          `UPDATE ltw_campaign_generation_jobs SET status='RUNNING',fence=fence+1,worker_id=$4,
        lease_until=clock_timestamp()+make_interval(secs=>$5),updated_at=clock_timestamp() WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3 RETURNING *`,
          [...keys(scope), workerId, LEASE_SECONDS],
        )
      ).rows[0];
      if (!claimed) throw new Error('CLAIM_NOT_STORED');
      return {
        kind: 'claimed',
        job: jobView(claimed),
        lease: { ...scope, workerId, fence: claimed.fence, authSessionId: claimed.auth_session_id },
      } as const;
    });
  }
  renew(lease: GenerationLease) {
    return transaction(this.#pool, async (client) => {
      const row = await loadJob(client, lease, true);
      if (!(await activeLease(client, row, lease))) return { kind: 'fenced' } as const;
      const changed = (
        await client.query<JobRow>(
          `UPDATE ltw_campaign_generation_jobs SET lease_until=clock_timestamp()+make_interval(secs=>$4),updated_at=clock_timestamp()
      WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3 RETURNING *`,
          [...keys(lease), LEASE_SECONDS],
        )
      ).rows[0];
      if (!changed) throw new Error('RENEW_NOT_STORED');
      return { kind: 'saved', job: jobView(changed) } as const;
    });
  }
  cancel(scope: GenerationJobScope): Promise<JobMutation> {
    return transaction(this.#pool, async (client) => {
      const row = await loadJob(client, scope, true);
      if (!row) return { kind: 'not-found' };
      if (row.status === 'CANCELLED') return { kind: 'saved', job: jobView(row) };
      if (row.status !== 'QUEUED' && row.status !== 'RUNNING') return { kind: 'conflict' };
      const changed = (
        await client.query<JobRow>(
          `UPDATE ltw_campaign_generation_jobs SET status='CANCELLED',fence=fence+1,lease_until=NULL,updated_at=clock_timestamp()
      WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3 RETURNING *`,
          keys(scope),
        )
      ).rows[0];
      if (!changed) throw new Error('CANCEL_NOT_STORED');
      return { kind: 'saved', job: jobView(changed) };
    });
  }
  prepareStep(lease: GenerationLease, input: GenerationStepInput) {
    return transaction(this.#pool, (client) => prepareStep(client, lease, input));
  }
  beginDispatch(lease: GenerationLease, ordinal: number) {
    return transaction(this.#pool, (client) => beginDispatch(client, lease, ordinal));
  }
  completeStep(
    lease: GenerationLease,
    ordinal: number,
    result: Parameters<CampaignGenerationRepository['completeStep']>[2],
  ) {
    return transaction(this.#pool, (client) => completeStep(client, lease, ordinal, result));
  }
  fail(lease: GenerationLease, code: string, dispatchUnknown = false) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(code)) throw new Error('INVALID_GENERATION_FAILURE');
    return transaction(this.#pool, async (client) => {
      const row = await loadJob(client, lease, true);
      if (!(await activeLease(client, row, lease))) return { kind: 'fenced' } as const;
      // A lost completion COMMIT acknowledgement can leave a reusable result.
      // Only an unresolved durable dispatch is uncertain; recovery resumes saved outputs.
      if (
        dispatchUnknown &&
        row &&
        !(await loadSteps(client, lease)).some(
          (step) => step.ordinal === row.next_step && step.status === 'DISPATCHING',
        )
      )
        return { kind: 'saved', job: jobView(row) } as const;
      const changed = (
        await client.query<JobRow>(
          `UPDATE ltw_campaign_generation_jobs SET status=$4,failure_code=$5,fence=fence+1,lease_until=NULL,updated_at=clock_timestamp()
        WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3 RETURNING *`,
          [...keys(lease), dispatchUnknown ? 'DISPATCH_UNKNOWN' : 'FAILED', code],
        )
      ).rows[0];
      if (!changed) throw new Error('FAIL_NOT_STORED');
      return { kind: 'saved', job: jobView(changed) } as const;
    });
  }
  finalize(lease: GenerationLease) {
    return transaction(this.#pool, (client) => finalize(client, lease));
  }
}
