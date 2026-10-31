import type pg from 'pg';

/**
 * Bounds on an owner's paid workshop jobs (Gate 07, G07-01; owner disposition 2026-10-31): one
 * active generation or edit per draft and two per owner, four active pictures per owner. Active is
 * QUEUED or RUNNING. Counted inside the enqueue transaction, after the draft lock and under a
 * per-owner advisory lock, so two drafts never both take an owner's last place; a refusal is the
 * fixed 429, which the workshop client words as "wait for a running job to finish".
 */
export const WORKSHOP_JOB_LIMITS = {
  textPerDraft: 1,
  textPerOwner: 2,
  picturesPerOwner: 4,
} as const;

async function lockOwnerJobs(client: pg.PoolClient, ownerId: string): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('ltw-workshop-jobs:' || $1::text, 0))",
    [ownerId],
  );
}

/** GENERATE and EDIT jobs share one table and one bound. */
export async function textJobAllowed(
  client: pg.PoolClient,
  scope: { readonly ownerId: string; readonly draftId: string },
): Promise<boolean> {
  await lockOwnerJobs(client, scope.ownerId);
  const row = (
    await client.query<{ draft: number; owner: number }>(
      `SELECT count(*) FILTER (WHERE draft_id = $2)::int AS draft, count(*)::int AS owner
       FROM ltw_campaign_generation_jobs WHERE owner_id = $1 AND status IN ('QUEUED', 'RUNNING')`,
      [scope.ownerId, scope.draftId],
    )
  ).rows[0];
  return (
    (row?.draft ?? 0) < WORKSHOP_JOB_LIMITS.textPerDraft &&
    (row?.owner ?? 0) < WORKSHOP_JOB_LIMITS.textPerOwner
  );
}

export async function pictureJobAllowed(client: pg.PoolClient, ownerId: string): Promise<boolean> {
  await lockOwnerJobs(client, ownerId);
  const row = (
    await client.query<{ active: number }>(
      `SELECT count(*)::int AS active FROM ltw_workshop_image_jobs
       WHERE owner_id = $1 AND status IN ('QUEUED', 'RUNNING')`,
      [ownerId],
    )
  ).rows[0];
  return (row?.active ?? 0) < WORKSHOP_JOB_LIMITS.picturesPerOwner;
}

/**
 * The serial workers' pick (`pending`): owners in turn, each owner's oldest waiting job first,
 * then each owner's next one, so one owner's queue never holds every other owner back.
 */
export const OWNERS_IN_TURN =
  'row_number() OVER (PARTITION BY owner_id ORDER BY created_at, job_id)';

/** The same order for the in-memory stores under `testing/`. */
export function ownersInTurn<
  T extends { readonly ownerId: string; readonly createdAt: string; readonly jobId: string },
>(jobs: readonly T[]): T[] {
  const age = (a: T, b: T) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.jobId < b.jobId ? -1 : 1;
  const turns = new Map<T, number>();
  const seen = new Map<string, number>();
  for (const job of [...jobs].sort(age)) {
    const turn = (seen.get(job.ownerId) ?? 0) + 1;
    seen.set(job.ownerId, turn);
    turns.set(job, turn);
  }
  return [...jobs].sort((a, b) => (turns.get(a) ?? 0) - (turns.get(b) ?? 0) || age(a, b));
}

interface JobState {
  readonly ownerId: string;
  readonly draftId: string;
  readonly status: string;
}
const activeOf = (jobs: Iterable<JobState>, ownerId: string) =>
  [...jobs].filter(
    (job) => job.ownerId === ownerId && (job.status === 'QUEUED' || job.status === 'RUNNING'),
  );

/** The in-memory stores' bounds: whether an owner's active jobs leave room for one more. */
export function roomForTextJob(
  jobs: Iterable<JobState>,
  scope: { readonly ownerId: string; readonly draftId: string },
): boolean {
  const own = activeOf(jobs, scope.ownerId);
  return (
    own.filter((job) => job.draftId === scope.draftId).length < WORKSHOP_JOB_LIMITS.textPerDraft &&
    own.length < WORKSHOP_JOB_LIMITS.textPerOwner
  );
}
export const roomForPicture = (jobs: Iterable<JobState>, ownerId: string): boolean =>
  activeOf(jobs, ownerId).length < WORKSHOP_JOB_LIMITS.picturesPerOwner;
