import type { DraftImageJob, DraftImageSubject } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import type { usePictureActions } from './actions.ts';
import { pictureJobAnswerSchema } from './schemas.ts';
import { pictureStatusWords, purposeWords } from './words.ts';

export function PictureJobs({
  draftId,
  jobs,
  subjects,
  actions,
}: {
  readonly draftId: string;
  readonly jobs: readonly DraftImageJob[];
  readonly subjects: readonly DraftImageSubject[];
  readonly actions: ReturnType<typeof usePictureActions>;
}) {
  const t = useT();
  return (
    <section aria-label={t('Picture generation history')}>
      <h4>{t('Picture generation history')}</h4>
      {!jobs.length && <p>{t('No picture requests for this revision yet.')}</p>}
      <ul className="workshop-picture-jobs" tabIndex={jobs.length ? 0 : undefined}>
        {jobs.map((job) => (
          <li key={job.jobId}>
            <div>
              <strong>
                {subjects.find((subject) => subject.entityId === job.entityId)?.name ??
                  t('An earlier object')}{' '}
                · {purposeWords(t, job.purpose)}
              </strong>
              <p>{pictureStatusWords(t, job.status)}</p>
              {job.status === 'FAILED' && (
                <p>{t('The image request failed. You may make a new request explicitly.')}</p>
              )}
              {job.status === 'DISPATCH_UNKNOWN' && (
                <p>
                  {t(
                    'The provider may have received this request. It will not be sent again automatically.',
                  )}
                </p>
              )}
            </div>
            {['QUEUED', 'RUNNING'].includes(job.status) && (
              <button
                disabled={actions.busy}
                onClick={() => {
                  void actions.send(
                    `/drafts/${draftId}/images/jobs/${job.jobId}/cancel`,
                    {},
                    pictureJobAnswerSchema,
                  );
                }}
              >
                {t('Cancel picture request')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
