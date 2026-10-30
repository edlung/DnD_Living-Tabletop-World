import { CAMPAIGN_GENERATION_STAGES, type CampaignPackage } from '@ltw/contracts';
import type pg from 'pg';

import type { GenerationJobScope, GenerationMode } from '../../workshop/generation/store.ts';
import { fakeFetch, jsonResponse } from '../fake-fetch.ts';
import { specimenOutput } from '../generation/fixture.ts';
import { ANTHROPIC } from '../raw-adapter-fixtures.ts';

export interface AdmissionEvidence {
  readonly traceId: string;
  readonly attemptId: string;
  readonly preparationSessionId: string;
  readonly jobId: string;
  readonly stage: string;
  readonly mode: GenerationMode;
}
interface DispatchRow {
  trace_id: string;
  attempt_id: string;
  preparation_session_id: string;
  mode: GenerationMode;
  current: boolean;
  subject_kind: string;
  campaign_id: string | null;
  session_class: string;
  policy: string;
}

/** Scripted transport only: every surrounding admission/storage component stays real. */
export function integratedCampaignTransport(observer: pg.Pool, specimen: CampaignPackage) {
  let binding: (GenerationJobScope & { mode: GenerationMode; proposal?: CampaignPackage }) | null =
    null;
  const admissions: AdmissionEvidence[] = [];
  const transport = fakeFetch(async (call) => {
    if (!binding) throw new Error('TEST_TRANSPORT_UNBOUND');
    const body = JSON.parse(call.body) as { tools: readonly { name: string }[] };
    const tool = body.tools[0]?.name;
    const stage = CAMPAIGN_GENERATION_STAGES.find(
      (candidate) => `prepare_campaign_${candidate.replaceAll('-', '_')}` === tool,
    );
    const editing = binding.mode === 'EDIT';
    if (!tool || (editing ? tool !== 'prepare_campaign_edit' : !stage))
      throw new Error('TEST_TRANSPORT_TOOL_MISMATCH');
    const step = editing ? 'edit' : stage;
    if (!step) throw new Error('TEST_TRANSPORT_STAGE_ABSENT');
    const ordinal = step === 'edit' ? 0 : CAMPAIGN_GENERATION_STAGES.indexOf(step);
    const proof = await observer.query<DispatchRow>(
      `SELECT s.trace_id,a.attempt_id,p.preparation_session_id,j.mode,
         (j.status='RUNNING' AND j.lease_until>clock_timestamp()
          AND d.fence=j.fence AND p.job_fence=j.fence) AS current,
         r.subject_kind,r.campaign_id,r.session_class,
         (SELECT mode FROM ltw_ai_text_policies WHERE account_id=a.account_id
          ORDER BY revision DESC LIMIT 1) policy
       FROM ltw_campaign_generation_steps s
       JOIN ltw_campaign_generation_jobs j USING(owner_id,draft_id,job_id)
       JOIN ltw_campaign_generation_dispatches d USING(owner_id,draft_id,job_id,ordinal)
       JOIN ltw_ai_requests r ON r.request_id=s.trace_id
       JOIN ltw_ai_attempts a ON a.request_id=r.request_id
       JOIN ltw_ai_preparation_sessions p ON p.preparation_session_id=r.preparation_session_id
       WHERE j.owner_id=$1 AND j.draft_id=$2 AND j.job_id=$3 AND s.ordinal=$4
         AND r.workshop_owner_id=j.owner_id AND r.workshop_draft_id=j.draft_id
         AND p.job_id=j.job_id AND p.auth_session_id=j.auth_session_id
         AND a.subject_kind='workshop' AND a.campaign_id IS NULL
         AND a.preparation_session_id=p.preparation_session_id AND a.reserved_micros>0`,
      [binding.ownerId, binding.draftId, binding.jobId, ordinal],
    );
    const row = proof.rows[0];
    if (
      proof.rows.length !== 1 ||
      !row?.current ||
      row.mode !== binding.mode ||
      row.subject_kind !== 'workshop' ||
      row.campaign_id !== null ||
      row.session_class !== 'preparation' ||
      row.policy !== 'UNLIMITED'
    )
      throw new Error('TEST_ADMISSION_NOT_DURABLE');
    admissions.push({
      traceId: row.trace_id,
      attemptId: row.attempt_id,
      preparationSessionId: row.preparation_session_id,
      jobId: binding.jobId,
      stage: step,
      mode: binding.mode,
    });
    if (editing && !binding.proposal) throw new Error('TEST_EDIT_PROPOSAL_ABSENT');
    return jsonResponse(
      ANTHROPIC.reply({
        tool,
        model: 'claude-sonnet-5-5',
        output: step === 'edit' ? binding.proposal : specimenOutput(step, specimen),
      }),
    );
  });
  return {
    ...transport,
    admissions,
    bind: (next: NonNullable<typeof binding>) => {
      binding = next;
    },
  };
}
