import type { CampaignGenerationJob } from '@ltw/contracts';
import { StatusPanel, useLanguage, useT } from '@ltw/ui';
import { useEffect, useRef, useState } from 'react';

import type { WorkshopClient } from '../client.ts';
import { jobsSchema } from '../response-schemas.ts';
import { useRequestSignal } from '../use-request-signal.ts';
import { GenerationForm } from './form.tsx';
import { GenerationJob, generationRunning } from './job.tsx';
import { useGeneration } from './use-generation.ts';
import { availabilityWords, jobWords } from './words.ts';

export function GenerationTab({
  client,
  draftId,
  headRevision,
  onRevisionChanged,
  onInspectCandidate,
  onInspectRevision,
  onInspectStep,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly headRevision: number;
  readonly onRevisionChanged: () => void;
  readonly onInspectCandidate: (jobId: string) => void;
  readonly onInspectRevision: (revision: number) => void;
  readonly onInspectStep: (jobId: string, ordinal: number) => void;
}) {
  const t = useT();
  const language = useLanguage();
  const [selected, setSelected] = useState<string | null>(null);
  const [older, setOlder] = useState<{
    jobs: CampaignGenerationJob[];
    nextCursor: string | null;
  } | null>(null);
  const [paging, setPaging] = useState<'idle' | 'loading' | 'failed'>('idle');
  const signal = useRequestSignal();
  // The hook reads only lightweight progress; full owner content belongs to Scenario.
  const first = useGeneration(client, draftId, selected);
  const history = first.history.resource.status === 'ready' ? first.history.resource.value : null;
  const jobId = selected ?? history?.jobs[0]?.jobId ?? null;
  useEffect(() => {
    if (selected === null && jobId !== null) setSelected(jobId);
  }, [selected, jobId]);
  const progress =
    first.progress.resource.status === 'ready' ? first.progress.resource.value : null;
  const notified = useRef<number | null>(null);
  useEffect(() => {
    const attached = progress?.job.attachedRevision;
    if (
      attached !== undefined &&
      attached !== null &&
      attached > headRevision &&
      notified.current !== attached
    ) {
      notified.current = attached;
      onRevisionChanged();
    }
  }, [progress, headRevision, onRevisionChanged]);
  const allJobs = [...(history?.jobs ?? []), ...(older?.jobs ?? [])].filter(
    (job, index, all) => all.findIndex((other) => other.jobId === job.jobId) === index,
  );
  const cursor = older ? older.nextCursor : history?.nextCursor;
  const more = async () => {
    if (!cursor || paging === 'loading') return;
    setPaging('loading');
    const result = await client.request(
      `/drafts/${draftId}/generation?after=${cursor}`,
      jobsSchema,
      { signal: signal() },
    );
    if (result.kind === 'cancelled' || result.kind === 'signed-out') return;
    setPaging(result.kind === 'ready' ? 'idle' : 'failed');
    if (result.kind === 'ready')
      setOlder({
        jobs: [...(older?.jobs ?? []), ...result.value.jobs],
        nextCursor: result.value.nextCursor,
      });
  };
  const refresh = () => {
    first.history.reread();
    first.progress.reread();
  };
  if (first.history.resource.status !== 'ready')
    return (
      <StatusPanel
        state={first.history.resource.status}
        label={
          first.history.resource.status === 'error'
            ? t('The generation history could not be read.')
            : t('Reading generation history…')
        }
        onRetry={first.history.retry}
      />
    );
  const availability = first.history.resource.value.availability;
  const restoring = allJobs.length > 0 && (!selected || first.progress.resource.status !== 'ready');
  const running = allJobs.some((job) =>
    generationRunning(job.jobId === progress?.job.jobId ? progress.job : job),
  );
  return (
    <div className="workshop-generation-layout">
      <div>
        {!availability.available && (
          <section className="workshop-panel workshop-availability" role="status">
            <p>{availabilityWords(t, availability.reason)}</p>
            <button onClick={first.history.reread}>{t('Check generation availability')}</button>
          </section>
        )}
        <GenerationForm
          client={client}
          draftId={draftId}
          headRevision={headRevision}
          initialBrief={progress?.brief ?? null}
          restoring={restoring}
          enabled={availability.available}
          running={running}
          onQueued={(id) => {
            setSelected(id);
            refresh();
          }}
          onConflict={() => {
            refresh();
            onRevisionChanged();
          }}
        />
      </div>
      <div className="workshop-generation-results">
        <section className="workshop-panel">
          <div className="workshop-section-heading">
            <h3>{t('Generation history')}</h3>
            <button onClick={refresh}>{t('Refresh generation history')}</button>
          </div>
          {!allJobs.length && <p>{t('No generation has been started for this draft.')}</p>}
          <ol className="workshop-generation-history">
            {allJobs.map((job) => (
              <li key={job.jobId}>
                <button
                  aria-pressed={selected === job.jobId}
                  onClick={() => {
                    setSelected(job.jobId);
                  }}
                >
                  <time dateTime={job.createdAt}>
                    {new Intl.DateTimeFormat(language, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(job.createdAt))}
                  </time>
                  <span>
                    {jobWords(
                      t,
                      job.jobId === progress?.job.jobId ? progress.job.status : job.status,
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {cursor && (
            <button
              disabled={paging === 'loading'}
              onClick={() => {
                void more();
              }}
            >
              {t('More generation jobs')}
            </button>
          )}
          {paging === 'failed' && (
            <p role="alert">{t('The generation history could not be read.')}</p>
          )}
        </section>
        {selected && first.progress.resource.status !== 'ready' && (
          <StatusPanel
            state={first.progress.resource.status}
            label={
              first.progress.resource.status === 'error'
                ? t('Generation progress could not be read.')
                : t('Reading generation progress…')
            }
            onRetry={first.progress.retry}
          />
        )}
        {progress && (
          <GenerationJob
            key={progress.job.jobId}
            client={client}
            draftId={draftId}
            progress={progress}
            onRefresh={refresh}
            onSelectJob={setSelected}
            onInspectCandidate={onInspectCandidate}
            onInspectRevision={onInspectRevision}
            onInspectStep={onInspectStep}
          />
        )}
      </div>
    </div>
  );
}
