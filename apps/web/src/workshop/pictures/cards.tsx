import type { DraftImageCandidate, DraftImageSubject, DraftVisualManifest } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import { useContentImage } from '../../visual/approved-images.ts';
import type { usePictureActions } from './actions.ts';
import { selectionAnswerSchema } from './schemas.ts';
import { pictureSlot, purposeWords } from './words.ts';

export function PictureCandidates({
  candidates,
  subject,
  manifest,
  draftId,
  actions,
}: {
  readonly candidates: readonly DraftImageCandidate[];
  readonly subject: DraftImageSubject;
  readonly manifest: DraftVisualManifest;
  readonly draftId: string;
  readonly actions: ReturnType<typeof usePictureActions>;
}) {
  const t = useT();
  return (
    <section aria-label={t('Picture candidates')}>
      <h4>{t('Picture candidates')}</h4>
      {!candidates.length && <p>{t('No picture candidates for this object yet.')}</p>}
      <ul className="workshop-picture-candidates">
        {candidates.map((candidate) => {
          const entry = manifest.entries.find(
            (item) => item.entityId === subject.entityId && item.purpose === candidate.purpose,
          );
          const chosen = entry?.candidateId === candidate.candidateId;
          return (
            <li key={candidate.candidateId} className="workshop-picture-card">
              <CandidateImage
                key={`${manifest.digest}:${candidate.contentHash}`}
                candidate={candidate}
              />
              <h5>{purposeWords(t, candidate.purpose)}</h5>
              <p>{t('From saved revision {revision}', { revision: candidate.sourceRevision })}</p>
              <p>
                {candidate.provider} · {candidate.model}
              </p>
              {chosen && (
                <p>
                  {entry.state === 'CURRENT' ? t('Chosen picture') : t('Chosen picture is stale')}
                </p>
              )}
              <button
                disabled={actions.busy || (chosen && entry.state === 'CURRENT')}
                onClick={() => {
                  void actions.send(
                    `/drafts/${draftId}/images/selection`,
                    {
                      requestId: crypto.randomUUID(),
                      revision: manifest.revision,
                      packageDigest: manifest.packageDigest,
                      expectedManifestVersion: manifest.version,
                      ...pictureSlot(subject.entityId, candidate.purpose),
                      candidateId: candidate.candidateId,
                    },
                    selectionAnswerSchema,
                  );
                }}
              >
                {t('Choose picture')}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CandidateImage({ candidate }: { readonly candidate: DraftImageCandidate }) {
  const t = useT();
  const { url, settled } = useContentImage(candidate.contentHash);
  return url ? (
    <img
      src={url}
      alt={t('Candidate for {purpose}', { purpose: purposeWords(t, candidate.purpose) })}
    />
  ) : (
    <p className="workshop-picture-placeholder">
      {settled ? t('Picture bytes are unavailable.') : t('Loading picture…')}
    </p>
  );
}

export function PictureSelection({
  subject,
  manifest,
  draftId,
  actions,
}: {
  readonly subject: DraftImageSubject;
  readonly manifest: DraftVisualManifest;
  readonly draftId: string;
  readonly actions: ReturnType<typeof usePictureActions>;
}) {
  const t = useT();
  const entries = manifest.entries.filter((entry) => entry.entityId === subject.entityId);
  return (
    <section aria-label={t('Chosen pictures')}>
      <h4>{t('Chosen pictures')}</h4>
      {!entries.length && <p>{t('No picture is chosen. The preview uses a neutral fallback.')}</p>}
      <ul className="workshop-picture-selections">
        {entries.map((entry) => (
          <li key={`${entry.purpose}:${entry.variant}:${entry.label ?? ''}`}>
            <SelectedPicture
              key={`${manifest.digest}:${entry.contentHash}`}
              hash={entry.contentHash}
            />
            <div>
              <strong>{purposeWords(t, entry.purpose)}</strong>
              <p>
                {entry.state === 'CURRENT'
                  ? t('Current picture')
                  : entry.staleReason === 'REFERENCE_CHANGED'
                    ? t('Stale: the chosen reference changed.')
                    : t('Stale: the appearance or object changed.')}
              </p>
            </div>
            <button
              disabled={actions.busy}
              onClick={() => {
                void actions.send(
                  `/drafts/${draftId}/images/selection`,
                  {
                    requestId: crypto.randomUUID(),
                    revision: manifest.revision,
                    packageDigest: manifest.packageDigest,
                    expectedManifestVersion: manifest.version,
                    ...pictureSlot(subject.entityId, entry.purpose),
                    candidateId: null,
                  },
                  selectionAnswerSchema,
                );
              }}
            >
              {t('Remove chosen picture')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SelectedPicture({ hash }: { readonly hash: string }) {
  const t = useT();
  const { url, settled } = useContentImage(hash);
  return url ? (
    <img className="workshop-picture-chosen" src={url} alt={t('Chosen picture')} />
  ) : (
    <p>{settled ? t('Picture bytes are unavailable.') : t('Loading picture…')}</p>
  );
}
