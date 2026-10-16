import type { EntityKind } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useEffect, useId, useRef, useState } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { useDmImages } from './dm-images.ts';
import { ApprovedCard, CandidateCard, ImagesResult, RequestRow } from './image-cards.tsx';
import { choiceOfKind, entityImages } from './lineage.ts';
import { RequestForm, type ReplacePreset } from './request-form.tsx';
import { kindWords } from './words.ts';

/**
 * The DM's images of the selected entity, in its panel (docs/STAGE_330_DESIGN.md "DM controls"):
 * what is approved now (with Replace), the candidates waiting for the DM (Approve, Discard,
 * Generate again), requests the image generator is working on or that failed (with the fixed
 * reason and Try again), and a new request. Only in the DM perspective: a lower perspective
 * has no context for it and renders nothing. Candidates and requests are the DM's alone.
 */
export function EntityImages({
  entityId,
  kind,
}: {
  readonly entityId: string;
  readonly kind: EntityKind;
}) {
  const t = useT();
  const images = useDmImages();
  const ids = useId();
  const [preset, setPreset] = useState<ReplacePreset | null>(null);
  const section = useRef<HTMLElement>(null);
  const place = `details:${entityId}`;
  const lineage = images?.lineage.status === 'ready' ? images.lineage.value : null;
  const settled = images?.command.place === place && images.command.status === 'done';
  // A card the DM acted on leaves the list: focus returns to the section, never to the page.
  useEffect(() => {
    const active = document.activeElement;
    if (settled && (active === null || active === document.body || !active.isConnected)) {
      section.current?.focus({ preventScroll: true });
    }
  }, [settled, lineage]);
  if (!images) return null;
  const mine = lineage ? entityImages(lineage, entityId) : null;
  const context = { place, subject: (what: string) => what };
  return (
    <section ref={section} className="dm-images" aria-labelledby={`${ids}-title`} tabIndex={-1}>
      <h3 id={`${ids}-title`}>
        <Glyph name="picture" />
        {t('Images (DM)')}
      </h3>
      {!mine ? (
        <StatusPanel
          state={images.lineage.status === 'error' ? 'error' : 'loading'}
          label={
            images.lineage.status === 'error' ? images.lineage.message : t('Reading the pictures…')
          }
          onRetry={images.retryRead}
        />
      ) : (
        <>
          <ImagesResult place={place} />
          <h4 className="dm-images-part">{t('Approved')}</h4>
          {mine.approved.length === 0 ? (
            <p className="muted">
              {t('No picture is approved yet: players see the neutral fallback.')}
            </p>
          ) : (
            <ul className="image-cards image-cards--approved">
              {mine.approved.map((shown) => (
                <ApprovedCard
                  key={shown.asset.assetId}
                  shown={shown}
                  context={context}
                  onReplace={() => {
                    setPreset({
                      ...choiceOfKind(shown.asset),
                      what: kindWords(t, shown.asset),
                      nonce: (preset?.nonce ?? 0) + 1,
                    });
                  }}
                />
              ))}
            </ul>
          )}
          {mine.candidates.length > 0 && (
            <>
              <h4 className="dm-images-part">{t('Waiting for your approval')}</h4>
              <p className="muted">{t('Only you see these until you approve one.')}</p>
              <ul className="image-cards">
                {mine.candidates.map((shown) => (
                  <CandidateCard
                    key={shown.asset.assetId}
                    shown={shown}
                    replaces={mine.canonical}
                    context={context}
                  />
                ))}
              </ul>
            </>
          )}
          {mine.working.length + mine.failed.length > 0 && (
            <>
              <h4 className="dm-images-part">{t('Requests')}</h4>
              <ul className="image-requests">
                {[...mine.working, ...mine.failed].map((request) => (
                  <RequestRow key={request.requestId} request={request} context={context} />
                ))}
              </ul>
            </>
          )}
          <RequestForm
            entityId={entityId}
            kind={kind}
            canonical={mine.canonical}
            place={place}
            preset={preset}
          />
        </>
      )}
    </section>
  );
}
