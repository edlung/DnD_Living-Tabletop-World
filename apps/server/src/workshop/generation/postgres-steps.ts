import type pg from 'pg';

import {
  activeLease,
  checkedContent,
  checkedStep,
  digest,
  keys,
  loadJob,
  loadSteps,
} from './postgres-rows.ts';
import type {
  CampaignGenerationRepository,
  GenerationLease,
  GenerationStepInput,
} from './store.ts';

export async function prepareStep(
  client: pg.PoolClient,
  lease: GenerationLease,
  raw: GenerationStepInput,
): ReturnType<CampaignGenerationRepository['prepareStep']> {
  const input = checkedStep(raw);
  const row = await loadJob(client, lease, true);
  if (!(await activeLease(client, row, lease))) return { kind: 'fenced' };
  const steps = await loadSteps(client, lease);
  const old = steps.find((step) => step.ordinal === input.ordinal);
  const inputDigest = digest(input);
  if (old)
    return old.inputDigest === inputDigest ? { kind: 'prepared', step: old } : { kind: 'conflict' };
  if (row?.next_step !== input.ordinal) return { kind: 'conflict' };
  const expected =
    input.ordinal === 0
      ? checkedContent(row.seed)
      : steps.find((step) => step.ordinal === input.ordinal - 1 && step.status === 'SUCCEEDED')
          ?.content;
  if (!expected || digest(input.input) !== digest(expected)) return { kind: 'conflict' };
  await client.query(
    `INSERT INTO ltw_campaign_generation_steps(owner_id,draft_id,job_id,ordinal,input,prompt,provider,model,trace_id,input_digest,created_at)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,clock_timestamp())`,
    [
      ...keys(lease),
      input.ordinal,
      JSON.stringify(input.input),
      input.prompt,
      input.provider,
      input.model,
      input.traceId,
      inputDigest,
    ],
  );
  const step = (await loadSteps(client, lease)).find((step) => step.ordinal === input.ordinal);
  if (!step) throw new Error('STEP_NOT_STORED');
  return { kind: 'prepared', step };
}
export async function beginDispatch(
  client: pg.PoolClient,
  lease: GenerationLease,
  ordinal: number,
): ReturnType<CampaignGenerationRepository['beginDispatch']> {
  const row = await loadJob(client, lease, true);
  if (!(await activeLease(client, row, lease))) return { kind: 'fenced' };
  const step = (await loadSteps(client, lease)).find((value) => value.ordinal === ordinal);
  if (step?.status === 'SUCCEEDED') return { kind: 'stored', step };
  if (!step || row?.next_step !== ordinal || step.status === 'DISPATCHING')
    return { kind: 'uncertain' };
  await client.query(
    `INSERT INTO ltw_campaign_generation_dispatches(owner_id,draft_id,job_id,ordinal,fence,dispatched_at)
    VALUES($1,$2,$3,$4,$5,clock_timestamp())`,
    [...keys(lease), ordinal, lease.fence],
  );
  return { kind: 'dispatch', step: { ...step, status: 'DISPATCHING' } };
}
export async function completeStep(
  client: pg.PoolClient,
  lease: GenerationLease,
  ordinal: number,
  result: Parameters<CampaignGenerationRepository['completeStep']>[2],
): ReturnType<CampaignGenerationRepository['completeStep']> {
  const content = checkedContent(result.content);
  if (
    result.providerRequestId !== null &&
    (result.providerRequestId.length < 1 || result.providerRequestId.length > 500)
  )
    throw new Error('INVALID_PROVIDER_RESPONSE_ID');
  const row = await loadJob(client, lease, true);
  if (!(await activeLease(client, row, lease))) return { kind: 'fenced' };
  const old = (await loadSteps(client, lease)).find((step) => step.ordinal === ordinal);
  if (old?.status === 'SUCCEEDED')
    return digest(old.content) === digest(content) &&
      old.providerRequestId === result.providerRequestId
      ? { kind: 'stored', step: old }
      : { kind: 'conflict' };
  if (!old || old.status !== 'DISPATCHING' || row?.next_step !== ordinal)
    return { kind: 'conflict' };
  await client.query(
    `INSERT INTO ltw_campaign_generation_results(owner_id,draft_id,job_id,ordinal,content,content_digest,provider_request_id,completed_at)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,clock_timestamp())`,
    [...keys(lease), ordinal, JSON.stringify(content), digest(content), result.providerRequestId],
  );
  await client.query(
    `UPDATE ltw_campaign_generation_jobs SET next_step=next_step+1,updated_at=clock_timestamp()
    WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3`,
    keys(lease),
  );
  const step = (await loadSteps(client, lease)).find((value) => value.ordinal === ordinal);
  if (!step) throw new Error('RESULT_NOT_STORED');
  return { kind: 'stored', step };
}
