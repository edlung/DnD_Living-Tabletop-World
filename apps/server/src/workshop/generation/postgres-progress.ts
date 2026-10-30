import { campaignBriefSchema, type CampaignGenerationProgressView } from '@ltw/contracts';
import type pg from 'pg';

import { keys, publicJob, PUBLIC_JOB_COLUMNS, STAGES, type PublicJobRow } from './postgres-rows.ts';
import type { GenerationJobScope } from './store.ts';

interface ProgressStepRow {
  readonly ordinal: number;
  readonly trace_id: string;
  readonly provider: string;
  readonly model: string;
  readonly created_at: string;
  readonly completed_at: string | null;
  readonly dispatched: boolean;
}
interface ProgressRow extends PublicJobRow {
  readonly brief: unknown;
  readonly steps: readonly ProgressStepRow[];
  readonly candidate_digest: string | null;
  readonly candidate_created_at: Date | null;
}

/** One statement snapshot; no step input/prompt/output or candidate content crosses the DB port. */
export async function loadProgress(
  client: pg.PoolClient,
  scope: GenerationJobScope,
): Promise<CampaignGenerationProgressView | null> {
  const columns = PUBLIC_JOB_COLUMNS.split(',')
    .map((column) => `j.${column}`)
    .join(',');
  const row = (
    await client.query<ProgressRow>(
      `SELECT ${columns},j.seed->'brief' AS brief,
    c.content_digest AS candidate_digest,c.created_at AS candidate_created_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'ordinal',s.ordinal,'trace_id',s.trace_id,'provider',s.provider,'model',s.model,
      'created_at',s.created_at,'completed_at',r.completed_at,'dispatched',d.job_id IS NOT NULL) ORDER BY s.ordinal)
      FROM ltw_campaign_generation_steps s
      LEFT JOIN ltw_campaign_generation_dispatches d USING(owner_id,draft_id,job_id,ordinal)
      LEFT JOIN ltw_campaign_generation_results r USING(owner_id,draft_id,job_id,ordinal)
      WHERE s.owner_id=$1 AND s.draft_id=$2 AND s.job_id=$3),'[]'::jsonb) AS steps
    FROM ltw_campaign_generation_jobs j LEFT JOIN ltw_campaign_generation_candidates c USING(owner_id,draft_id,job_id)
    WHERE j.owner_id=$1 AND j.draft_id=$2 AND j.job_id=$3`,
      keys(scope),
    )
  ).rows[0];
  if (!row) return null;
  return {
    job: publicJob(row),
    brief: campaignBriefSchema.parse(row.brief),
    steps: row.steps.map((step) => ({
      ordinal: step.ordinal,
      stage: STAGES[step.ordinal] ?? '',
      status:
        step.completed_at !== null ? 'SUCCEEDED' : step.dispatched ? 'DISPATCHING' : 'PREPARED',
      traceId: step.trace_id,
      provider: step.provider,
      model: step.model,
      createdAt: new Date(step.created_at).toISOString(),
      completedAt: step.completed_at === null ? null : new Date(step.completed_at).toISOString(),
    })),
    candidate:
      row.candidate_digest !== null && row.candidate_created_at !== null
        ? {
            contentDigest: row.candidate_digest,
            baseRevision: row.base_revision,
            createdAt: row.candidate_created_at.toISOString(),
          }
        : null,
  };
}
