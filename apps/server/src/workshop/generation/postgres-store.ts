import type pg from 'pg';

import { workshopIdSchema, type CampaignGenerationJob } from '@ltw/contracts';
import {
  activeLease,
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
import {
  checkedJobInput,
  insertJob,
  previous,
  draftLock,
  enqueueContextCurrent,
} from './postgres-enqueue.ts';
import type {
  CampaignGenerationRepository,
  EnqueueGeneration,
  EnqueueEdit,
  GenerationMode,
  GenerationJobScope,
  GenerationLease,
  GenerationScope,
  GenerationStepInput,
  JobMutation,
} from './store.ts';

const bounded = (limit: number) => Math.min(50, Math.max(1, Math.trunc(limit)));
/** Every mutation is a short transaction. The provider is never called by this repository. */
export class PostgresCampaignGenerationRepository implements CampaignGenerationRepository {
  readonly mode: GenerationMode;
  readonly #pool: pg.Pool;
  constructor(pool: pg.Pool, mode: GenerationMode = 'GENERATE') {
    this.mode = mode;
    this.#pool = pool;
  }
  enqueue(raw: EnqueueGeneration): Promise<JobMutation> {
    if (this.mode !== 'GENERATE') return Promise.resolve({ kind: 'conflict' });
    return this.#enqueue(raw);
  }
  enqueueEdit(raw: EnqueueEdit): Promise<JobMutation> {
    if (this.mode !== 'EDIT') return Promise.resolve({ kind: 'conflict' });
    return this.#enqueue(raw);
  }
  #enqueue(raw: EnqueueGeneration | EnqueueEdit): Promise<JobMutation> {
    const input = checkedJobInput(raw, this.mode);
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
      const capturedLockVersion = await enqueueContextCurrent(client, input);
      if (capturedLockVersion === null) return { kind: 'conflict' };
      return {
        kind: 'saved',
        job: jobView(await insertJob(client, input, null, 0, capturedLockVersion)),
      };
    });
  }
  retry(
    rawScope: GenerationJobScope,
    requestId: string,
    authSessionId: string,
  ): Promise<JobMutation> {
    const scope = { ...rawScope, mode: this.mode };
    workshopIdSchema.parse(requestId);
    workshopIdSchema.parse(authSessionId);
    return transaction(this.#pool, async (client) => {
      if (!(await draftLock(client, scope))) return { kind: 'not-found' };
      const parent = await loadJob(client, scope, true);
      if (!parent) return { kind: 'not-found' };
      if (!(await liveSession(client, { owner_id: scope.ownerId, auth_session_id: authSessionId })))
        return { kind: 'conflict' };
      const parentJob = jobView(parent);
      const input = checkedJobInput(
        {
          ownerId: scope.ownerId,
          draftId: scope.draftId,
          requestId,
          authSessionId,
          basedOnRevision: parent.base_revision,
          seed: jobView(parent).seed,
          lockVersion: parent.lock_version,
          ...(parentJob.editSpec === null ? {} : { editSpec: parentJob.editSpec }),
        },
        this.mode,
      );
      const old = await previous(client, input, scope.jobId);
      if (old) return old;
      if (parent.status !== 'FAILED' || (await enqueueContextCurrent(client, input)) === null)
        return { kind: 'conflict' };
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
  requestById(scope: GenerationScope, requestId: string) {
    workshopIdSchema.parse(requestId);
    return transaction(this.#pool, async (client) => {
      const row = (
        await client.query<JobRow>(
          'SELECT * FROM ltw_campaign_generation_jobs WHERE owner_id=$1 AND draft_id=$2 AND mode=$3 AND request_id=$4',
          [scope.ownerId, scope.draftId, this.mode, requestId],
        )
      ).rows[0];
      return row ? jobView(row) : null;
    });
  }
  get(rawScope: GenerationJobScope) {
    const scope = { ...rawScope, mode: this.mode };
    return transaction(this.#pool, async (client) => {
      const row = await loadJob(client, scope);
      return row ? jobView(row) : null;
    });
  }
  progress(rawScope: GenerationJobScope) {
    const scope = { ...rawScope, mode: this.mode };
    return transaction(this.#pool, (client) => loadProgress(client, scope));
  }
  list(
    scope: GenerationScope,
    limit: number,
    before?: Pick<CampaignGenerationJob, 'createdAt' | 'jobId'> | null,
  ) {
    return transaction(this.#pool, async (client) => {
      const rows = await client.query<PublicJobRow>(
        `SELECT ${PUBLIC_JOB_COLUMNS} FROM ltw_campaign_generation_jobs WHERE owner_id=$1 AND draft_id=$2 AND mode=$6 AND ($4::timestamptz IS NULL OR (created_at,job_id)<($4::timestamptz,$5::uuid)) ORDER BY created_at DESC,job_id DESC LIMIT $3`,
        [
          scope.ownerId,
          scope.draftId,
          bounded(limit),
          before?.createdAt ?? null,
          before?.jobId ?? null,
          this.mode,
        ],
      );
      return rows.rows.map(publicJob);
    });
  }
  pending(limit: number) {
    return transaction(this.#pool, async (client) => {
      const rows = await client.query<{ owner_id: string; draft_id: string; job_id: string }>(
        `SELECT owner_id,draft_id,job_id FROM ltw_campaign_generation_jobs
      WHERE mode=$2 AND (status='QUEUED' OR (status='RUNNING' AND lease_until<=clock_timestamp())) ORDER BY created_at,job_id LIMIT $1`,
        [bounded(limit), this.mode],
      );
      return rows.rows.map((row) => ({
        ownerId: row.owner_id,
        draftId: row.draft_id,
        jobId: row.job_id,
      }));
    });
  }
  steps(rawScope: GenerationJobScope) {
    const scope = { ...rawScope, mode: this.mode };
    return transaction(this.#pool, (client) => loadSteps(client, scope));
  }
  candidate(rawScope: GenerationJobScope) {
    const scope = { ...rawScope, mode: this.mode };
    return transaction(this.#pool, (client) => loadCandidate(client, scope));
  }
  claim(rawScope: GenerationJobScope, workerId: string) {
    const scope = { ...rawScope, mode: this.mode };
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
  renew(rawLease: GenerationLease) {
    const lease = { ...rawLease, mode: this.mode };
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
  cancel(rawScope: GenerationJobScope): Promise<JobMutation> {
    const scope = { ...rawScope, mode: this.mode };
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
  prepareStep(rawLease: GenerationLease, input: GenerationStepInput) {
    const lease = { ...rawLease, mode: this.mode };
    return transaction(this.#pool, (client) => prepareStep(client, lease, input));
  }
  beginDispatch(rawLease: GenerationLease, ordinal: number) {
    const lease = { ...rawLease, mode: this.mode };
    return transaction(this.#pool, (client) => beginDispatch(client, lease, ordinal));
  }
  completeStep(
    rawLease: GenerationLease,
    ordinal: number,
    result: Parameters<CampaignGenerationRepository['completeStep']>[2],
  ) {
    const lease = { ...rawLease, mode: this.mode };
    return transaction(this.#pool, (client) => completeStep(client, lease, ordinal, result));
  }
  fail(rawLease: GenerationLease, code: string, dispatchUnknown = false) {
    const lease = { ...rawLease, mode: this.mode };
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
  finalize(rawLease: GenerationLease) {
    const lease = { ...rawLease, mode: this.mode };
    return transaction(this.#pool, (client) => finalize(client, lease));
  }
}
