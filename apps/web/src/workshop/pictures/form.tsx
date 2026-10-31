import type { AssetPurpose, DraftImageSubject, DraftVisualManifest } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useState, type SubmitEvent } from 'react';

import { pictureJobAnswerSchema } from './schemas.ts';
import { pictureSlot, purposeWords } from './words.ts';
import type { usePictureActions } from './actions.ts';

export function PictureForm({
  draftId,
  subject,
  manifest,
  available,
  actions,
}: {
  readonly draftId: string;
  readonly subject: DraftImageSubject;
  readonly manifest: DraftVisualManifest;
  readonly available: boolean;
  readonly actions: ReturnType<typeof usePictureActions>;
}) {
  const t = useT();
  const [purpose, setPurpose] = useState<AssetPurpose>('image');
  const [note, setNote] = useState('');
  const brief = subject.briefs.find((entry) => entry.purpose === purpose);
  const referenceMissing = purpose !== 'image' && !subject.referenceHash;
  const blocked = !available || !brief || referenceMissing;
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (blocked || actions.busy) return;
    void actions.send(
      `/drafts/${draftId}/images/jobs`,
      {
        requestId: crypto.randomUUID(),
        revision: manifest.revision,
        packageDigest: manifest.packageDigest,
        expectedManifestVersion: manifest.version,
        ...pictureSlot(subject.entityId, purpose),
        note: note.trim() || null,
      },
      pictureJobAnswerSchema,
    );
  };
  return (
    <form className="workshop-picture-form" onSubmit={submit}>
      <h4>{t('Generate a picture candidate')}</h4>
      <label htmlFor="draft-picture-purpose">{t('Picture purpose')}</label>
      <select
        id="draft-picture-purpose"
        value={purpose}
        disabled={actions.busy}
        onChange={(event) => {
          setPurpose(event.target.value as AssetPurpose);
        }}
      >
        {subject.allowedPurposes.map((entry) => (
          <option key={entry} value={entry}>
            {purposeWords(t, entry)}
          </option>
        ))}
      </select>
      {referenceMissing && (
        <p>{t('Choose a current main raster picture before requesting a figure or map.')}</p>
      )}
      {!brief && <p>{t('This object has no appearance brief for this purpose.')}</p>}
      {brief && (
        <div
          className="workshop-picture-brief"
          role="group"
          aria-label={t('What the image model will read')}
        >
          <p>
            {t(
              'Only these appearance and style notes, your optional note and any chosen reference reach the image model.',
            )}
          </p>
          <dl>
            <dt>{t('Appearance')}</dt>
            <dd>{brief.appearance || t('No appearance notes')}</dd>
            <dt>{t('Image style')}</dt>
            <dd>{brief.style || t('No style notes')}</dd>
          </dl>
        </div>
      )}
      <label htmlFor="draft-picture-note">{t('Note to the image model (optional)')}</label>
      <textarea
        id="draft-picture-note"
        maxLength={300}
        rows={3}
        disabled={actions.busy}
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
      <button
        className="primary-button"
        type="submit"
        disabled={blocked}
        aria-disabled={actions.busy || undefined}
      >
        {t('Generate picture')}
      </button>
    </form>
  );
}
