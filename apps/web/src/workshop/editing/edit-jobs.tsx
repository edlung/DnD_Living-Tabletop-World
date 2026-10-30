import { StatusPanel, useLanguage, useT } from '@ltw/ui';
import { useState } from 'react';
import type { CampaignEditTarget } from '@ltw/contracts';

import type { WorkshopClient } from '../client.ts';
import { GenerationJob } from '../generation/job.tsx';
import { useGeneration } from '../generation/use-generation.ts';
import { jobWords } from '../generation/words.ts';
import { jobsSchema, type GenerationProgress } from '../response-schemas.ts';
import { useRequestSignal } from '../use-request-signal.ts';

export function EditJobs({
  client,
  draftId,
  selected,
  onSelect,
  onReview,
  targets,
  onReuse,
  canReuse,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly selected: string | null;
  readonly onSelect: (id: string) => void;
  readonly onReview: (id: string) => void;
  readonly targets: readonly CampaignEditTarget[];
  readonly onReuse: (instruction: string, targets: readonly string[]) => void;
  readonly canReuse: boolean;
}) {
  const t = useT(),
    language = useLanguage(),
    signal = useRequestSignal();
  const data = useGeneration(client, draftId, selected, 'EDIT');
  const [older, setOlder] = useState<{
    jobs: GenerationProgress['job'][];
    nextCursor: string | null;
  } | null>(null);
  const [paging, setPaging] = useState(false);
  const refresh = () => {
    data.history.reread();
    data.progress.reread();
  };
  const history = data.history.resource.status === 'ready' ? data.history.resource.value : null;
  const progress = data.progress.resource.status === 'ready' ? data.progress.resource.value : null;
  const jobs = [
    ...(progress ? [progress.job] : []),
    ...(history?.jobs ?? []),
    ...(older?.jobs ?? []),
  ]
    .filter((job, index, all) => all.findIndex((other) => other.jobId === job.jobId) === index)
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) || right.jobId.localeCompare(left.jobId),
    );
  const cursor = older ? older.nextCursor : history?.nextCursor;
  const more = async () => {
    if (!cursor || paging) return;
    setPaging(true);
    const result = await client.request(`/drafts/${draftId}/edits?after=${cursor}`, jobsSchema, {
      signal: signal(),
    });
    if (result.kind === 'cancelled' || result.kind === 'signed-out') return;
    setPaging(false);
    if (result.kind === 'ready')
      setOlder({
        jobs: [...(older?.jobs ?? []), ...result.value.jobs],
        nextCursor: result.value.nextCursor,
      });
  };
  return (
    <div className="campaign-edit-jobs">
      <section className="workshop-panel" aria-label={t('AI edit history')}>
        <div className="workshop-section-heading">
          <h3>{t('AI edit history')}</h3>
          <button type="button" onClick={refresh}>
            {t('Refresh edit history')}
          </button>
        </div>
        {!history ? (
          <StatusPanel
            state={data.history.resource.status === 'error' ? 'error' : 'loading'}
            label={t('Reading edit history…')}
            onRetry={data.history.retry}
          />
        ) : !jobs.length ? (
          <p>{t('No AI edits have been requested yet.')}</p>
        ) : (
          <ol className="workshop-generation-history">
            {jobs.map((job) => (
              <li key={job.jobId}>
                <button
                  type="button"
                  aria-pressed={selected === job.jobId}
                  onClick={() => {
                    onSelect(job.jobId);
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
                      'EDIT',
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {cursor && (
          <button
            type="button"
            disabled={paging}
            onClick={() => {
              void more();
            }}
          >
            {t('More AI edits')}
          </button>
        )}
      </section>
      {progress?.edit && (
        <details className="workshop-panel">
          <summary>{t('Submitted edit instructions')}</summary>
          <p className="campaign-instruction">{progress.edit.instruction}</p>
          <ul>
            {progress.edit.requestedTargets.map((id) => (
              <li key={id}>
                {targets.find((target) => target.targetId === id)?.label ?? t('An earlier target')}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={!canReuse}
            onClick={() => {
              if (progress.edit) onReuse(progress.edit.instruction, progress.edit.requestedTargets);
            }}
          >
            {t('Use these instructions for a new edit')}
          </button>
        </details>
      )}
      {selected &&
        (progress ? (
          <GenerationJob
            client={client}
            draftId={draftId}
            progress={progress}
            onRefresh={refresh}
            onSelectJob={onSelect}
            onInspectCandidate={onReview}
          />
        ) : (
          <StatusPanel
            state={data.progress.resource.status === 'error' ? 'error' : 'loading'}
            label={t('Reading edit progress…')}
            onRetry={data.progress.retry}
          />
        ))}
    </div>
  );
}
