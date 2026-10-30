import type { CampaignGenerationJob } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useRef, useState } from 'react';

import type { WorkshopClient } from '../client.ts';
import { jobAnswerSchema, type GenerationProgress } from '../response-schemas.ts';
import { canRetryGeneration, jobWords, stepStatusWords, stepWords } from './words.ts';
import { useRequestSignal } from '../use-request-signal.ts';

export function GenerationJob({
  client,
  draftId,
  progress,
  onRefresh,
  onSelectJob,
  onInspectCandidate,
  onInspectRevision,
  onInspectStep,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly progress: GenerationProgress;
  readonly onRefresh: () => void;
  readonly onSelectJob: (jobId: string) => void;
  readonly onInspectCandidate: (jobId: string) => void;
  readonly onInspectRevision: (revision: number) => void;
  readonly onInspectStep: (jobId: string, ordinal: number) => void;
}) {
  const t = useT();
  const { job } = progress;
  const [command, setCommand] = useState<'cancel' | 'retry' | null>(null);
  const [failed, setFailed] = useState(false);
  const pending = useRef<{ requestId: string } | null>(null);
  const alive = useRef(true);
  const signal = useRequestSignal();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = async (action: 'cancel' | 'retry') => {
    if (command) return;
    setCommand(action);
    setFailed(false);
    const retry =
      action === 'retry' ? (pending.current ?? { requestId: crypto.randomUUID() }) : null;
    if (retry) pending.current = retry;
    const body = retry ?? {};
    const result = await client.request(
      `/drafts/${draftId}/generation/${job.jobId}/${action}`,
      jobAnswerSchema,
      { body, signal: signal() },
    );
    if (!alive.current) return;
    setCommand(null);
    setFailed(result.kind !== 'ready');
    if (result.kind === 'ready') {
      pending.current = null;
      if (action === 'retry') onSelectJob(result.value.job.jobId);
    }
    onRefresh();
  };
  const running = job.status === 'QUEUED' || job.status === 'RUNNING';
  return (
    <section className="workshop-panel workshop-job" aria-label={t('Selected generation')}>
      <h3>{jobWords(t, job.status)}</h3>
      <p>{t('Preparation steps completed: {count} of 7', { count: job.nextStep })}</p>
      {job.status === 'DISPATCH_UNKNOWN' && (
        <p role="status">
          {t(
            'The request may have reached AI. Automatic retry is paused to avoid an unintended duplicate.',
          )}
        </p>
      )}
      {job.failureCode && job.status !== 'DISPATCH_UNKNOWN' && (
        <p>
          {t(
            'This generation did not attach new content. Review the saved scenario or start again explicitly.',
          )}
        </p>
      )}
      <ol className="workshop-job-steps">
        {progress.steps.map((step) => (
          <li key={step.ordinal}>
            <strong>{stepWords(t, step.stage)}</strong>
            {' · '}
            {stepStatusWords(t, step.status, job.status)}
            {step.model && (
              <span className="muted">{t('Model: {model}', { model: step.model })}</span>
            )}
            {step.status === 'SUCCEEDED' && (
              <button
                onClick={() => {
                  onInspectStep(job.jobId, step.ordinal);
                }}
              >
                {t('View result: {stage}', { stage: stepWords(t, step.stage) })}
              </button>
            )}
          </li>
        ))}
      </ol>
      <div className="workshop-actions">
        {running && (
          <button
            disabled={command !== null}
            onClick={() => {
              void run('cancel');
            }}
          >
            {t('Cancel generation')}
          </button>
        )}
        {canRetryGeneration(job.status) && (
          <button
            disabled={command !== null}
            onClick={() => {
              void run('retry');
            }}
          >
            {t('Retry generation')}
          </button>
        )}
        {job.attachedRevision !== null && (
          <button
            onClick={() => {
              onInspectRevision(job.attachedRevision ?? 0);
            }}
          >
            {t('View generated scenario')}
          </button>
        )}
        {job.candidateAvailable && (
          <button
            onClick={() => {
              onInspectCandidate(job.jobId);
            }}
          >
            {t('View generation proposal')}
          </button>
        )}
      </div>
      {failed && (
        <p role="alert">
          {t('The action could not be confirmed. Refresh progress or retry the same action.')}
        </p>
      )}
    </section>
  );
}

export const generationRunning = (job: CampaignGenerationJob): boolean =>
  job.status === 'QUEUED' || job.status === 'RUNNING';
