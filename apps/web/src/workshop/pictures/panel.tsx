import { StatusPanel, useT } from '@ltw/ui';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useResource } from '../../api/resource.ts';
import { ApprovedImages, ApprovedImagesContext } from '../../visual/approved-images.ts';
import type { WorkshopClient } from '../client.ts';
import { EditConflict } from '../editing/conflicts.tsx';
import { usePictureActions } from './actions.ts';
import { PictureCandidates, PictureSelection } from './cards.tsx';
import { PictureForm } from './form.tsx';
import { PictureJobs } from './jobs.tsx';
import { picturesSchema } from './schemas.ts';

export function OwnerPictures({
  client,
  draftId,
  revision,
  onChanged,
  onManageProtections,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly revision: number;
  readonly onChanged: () => void;
  readonly onManageProtections?: () => void;
}) {
  const t = useT();
  const [entityId, setEntityId] = useState('');
  const [jobsBefore, setJobsBefore] = useState<string | null>(null);
  const [candidatesBefore, setCandidatesBefore] = useState<string | null>(null);
  const query = new URLSearchParams({ revision: String(revision) });
  if (entityId) query.set('entityId', entityId);
  if (jobsBefore) query.set('jobsBefore', jobsBefore);
  if (candidatesBefore) query.set('candidatesBefore', candidatesBefore);
  const encoded = query.toString();
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await client.request(`/drafts/${draftId}/images?${encoded}`, picturesSchema, {
        signal,
      });
      if (result.kind !== 'ready' || result.value.manifest.revision !== revision)
        throw new Error('PICTURES_UNAVAILABLE');
      return result.value;
    },
    [client, draftId, encoded, revision],
  );
  const { resource, retry, reread } = useResource(`draft-pictures:${encoded}`, load);
  const actions = usePictureActions(client, () => {
    reread();
    onChanged();
  });
  const running =
    resource.status === 'ready' &&
    resource.value.jobs.some((job) => ['QUEUED', 'RUNNING'].includes(job.status));
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(reread, 1200);
    return () => {
      clearInterval(timer);
    };
  }, [running, reread]);
  return (
    <section className="workshop-panel workshop-pictures" aria-label={t('Draft pictures')}>
      <div className="workshop-section-heading">
        <h3>{t('Draft pictures')}</h3>
        <button
          disabled={actions.busy}
          onClick={() => {
            retry();
            onChanged();
          }}
        >
          {t('Refresh pictures')}
        </button>
      </div>
      {onManageProtections && (
        <button
          className="workshop-object-link"
          type="button"
          disabled={actions.state === 'busy' || actions.state === 'uncertain'}
          onClick={onManageProtections}
        >
          {t('Manage protections in Scenario')}
        </button>
      )}
      <p>
        {t(
          'Generating creates a candidate. Choose it explicitly before it appears in the world preview.',
        )}
      </p>
      <ActionReceipt actions={actions} />
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status}
          label={
            resource.status === 'error'
              ? t('Draft pictures could not be read.')
              : t('Loading draft pictures…')
          }
          onRetry={retry}
        />
      ) : (
        <>
          {!resource.value.availability.available && (
            <p role="status">
              {resource.value.availability.reason === 'NO_ROUTE'
                ? t('No image provider is configured for this workshop.')
                : resource.value.availability.reason === 'NO_POLICY'
                  ? t('Image generation is not enabled for this workshop.')
                  : t('Picture generation is temporarily unavailable. Try again later.')}
            </p>
          )}
          <label htmlFor="workshop-picture-subject">{t('Picture object')}</label>
          <select
            id="workshop-picture-subject"
            value={entityId}
            disabled={actions.busy}
            onChange={(event) => {
              setEntityId(event.target.value);
              setCandidatesBefore(null);
            }}
          >
            <option value="">{t('Choose an object')}</option>
            {resource.value.subjects.map((subject) => (
              <option key={subject.entityId} value={subject.entityId}>
                {subject.name}
              </option>
            ))}
          </select>
          {(() => {
            const subject = resource.value.subjects.find((entry) => entry.entityId === entityId);
            return (
              subject && (
                <PictureBytes
                  key={`${revision}:${entityId}`}
                  client={client}
                  draftId={draftId}
                  revision={revision}
                  digest={resource.value.manifest.digest}
                >
                  <PictureSelection
                    subject={subject}
                    manifest={resource.value.manifest}
                    draftId={draftId}
                    actions={actions}
                  />
                  <div className="workshop-picture-workspace">
                    <PictureForm
                      key={subject.entityId}
                      draftId={draftId}
                      subject={subject}
                      manifest={resource.value.manifest}
                      available={resource.value.availability.available}
                      actions={actions}
                    />
                    <div className="workshop-picture-results">
                      <PictureCandidates
                        candidates={resource.value.candidates}
                        subject={subject}
                        manifest={resource.value.manifest}
                        draftId={draftId}
                        actions={actions}
                      />
                      <PageControls
                        before={candidatesBefore}
                        next={resource.value.candidatesNextCursor}
                        disabled={actions.busy}
                        onPage={setCandidatesBefore}
                        more={t('More picture candidates')}
                        first={t('Newest picture candidates')}
                      />
                    </div>
                  </div>
                </PictureBytes>
              )
            );
          })()}
          <PictureJobs
            draftId={draftId}
            jobs={resource.value.jobs}
            subjects={resource.value.subjects}
            actions={actions}
          />
          <PageControls
            before={jobsBefore}
            next={resource.value.jobsNextCursor}
            disabled={actions.busy}
            onPage={setJobsBefore}
            more={t('More picture requests')}
            first={t('Newest picture requests')}
          />
        </>
      )}
    </section>
  );
}

function PictureBytes({
  client,
  draftId,
  revision,
  digest,
  children,
}: {
  readonly client: WorkshopClient;
  readonly draftId: string;
  readonly revision: number;
  readonly digest: string;
  readonly children: ReactNode;
}) {
  const images = useMemo(
    () =>
      new ApprovedImages({
        image: async (hash, signal) => {
          const result = await client.bytes(
            `/drafts/${draftId}/images/content/${encodeURIComponent(hash)}?revision=${String(revision)}`,
            signal,
          );
          if (result.kind !== 'ready') throw new Error('PICTURE_UNAVAILABLE');
          return result.value;
        },
      }),
    [client, draftId, revision, digest],
  );
  useEffect(
    () => () => {
      images.release();
    },
    [images],
  );
  return <ApprovedImagesContext.Provider value={images}>{children}</ApprovedImagesContext.Provider>;
}

function ActionReceipt({ actions }: { readonly actions: ReturnType<typeof usePictureActions> }) {
  const t = useT();
  const element = useRef<HTMLDivElement>(null);
  const previous = useRef(actions.state);
  useLayoutEffect(() => {
    if (previous.current === 'busy' && actions.state !== 'busy') element.current?.focus();
    previous.current = actions.state;
  }, [actions.state]);
  if (actions.state === 'idle') return null;
  return (
    <div className="workshop-picture-receipt" role="status" tabIndex={-1} ref={element}>
      {actions.state === 'conflict' && actions.conflict !== null && (
        <EditConflict value={actions.conflict} />
      )}
      <p>
        {actions.state === 'busy'
          ? t('Saving the picture request…')
          : actions.state === 'done'
            ? t('Picture request recorded.')
            : actions.state === 'conflict'
              ? t(
                  'The pictures changed in another view. Refresh and review them before making a new choice.',
                )
              : t(
                  'The answer is uncertain. Retry the original request before making another choice.',
                )}
      </p>
      {actions.state === 'uncertain' && (
        <button onClick={actions.retry}>{t('Retry original picture request')}</button>
      )}
      {['uncertain', 'conflict'].includes(actions.state) && (
        <button onClick={actions.reset}>{t('Discard pending picture request and refresh')}</button>
      )}
    </div>
  );
}

function PageControls({
  before,
  next,
  onPage,
  more,
  first,
  disabled,
}: {
  readonly before: string | null;
  readonly next: string | null;
  readonly onPage: (cursor: string | null) => void;
  readonly more: string;
  readonly first: string;
  readonly disabled: boolean;
}) {
  return (
    <div className="workshop-inline-actions">
      {before && (
        <button
          disabled={disabled}
          onClick={() => {
            onPage(null);
          }}
        >
          {first}
        </button>
      )}
      {next && (
        <button
          disabled={disabled}
          onClick={() => {
            onPage(next);
          }}
        >
          {more}
        </button>
      )}
    </div>
  );
}
