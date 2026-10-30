import {
  campaignBriefSchema,
  campaignEditTargetIdSchema,
  type CampaignGenerationProgressView,
} from '@ltw/contracts';
import type pg from 'pg';
import { z } from 'zod';

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
  readonly edit: unknown;
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
    CASE WHEN j.mode='EDIT' THEN jsonb_build_object('instruction',j.edit_spec->'instruction','requestedTargets',j.edit_spec->'requestedTargets') ELSE NULL END AS edit,
    c.content_digest AS candidate_digest,c.created_at AS candidate_created_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'ordinal',s.ordinal,'trace_id',s.trace_id,'provider',s.provider,'model',s.model,
      'created_at',s.created_at,'completed_at',r.completed_at,'dispatched',d.job_id IS NOT NULL) ORDER BY s.ordinal)
      FROM ltw_campaign_generation_steps s
      LEFT JOIN ltw_campaign_generation_dispatches d USING(owner_id,draft_id,job_id,ordinal)
      LEFT JOIN ltw_campaign_generation_results r USING(owner_id,draft_id,job_id,ordinal)
      WHERE s.owner_id=$1 AND s.draft_id=$2 AND s.job_id=$3),'[]'::jsonb) AS steps
    FROM ltw_campaign_generation_jobs j LEFT JOIN ltw_campaign_generation_candidates c USING(owner_id,draft_id,job_id)
    WHERE j.owner_id=$1 AND j.draft_id=$2 AND j.job_id=$3 AND j.mode=$4`,
      [...keys(scope), scope.mode ?? 'GENERATE'],
    )
  ).rows[0];
  if (!row) return null;
  return {
    ...(row.edit === null
      ? {}
      : {
          edit: z
            .object({
              instruction: z.string().min(1).max(8000),
              requestedTargets: z.array(campaignEditTargetIdSchema).min(1).max(100),
            })
            .strict()
            .parse(row.edit),
        }),
    job: publicJob(row),
    brief: campaignBriefSchema.parse(row.brief),
    steps: row.steps.map((step) => ({
      ordinal: step.ordinal,
      stage: scope.mode === 'EDIT' ? 'edit' : (STAGES[step.ordinal] ?? ''),
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
