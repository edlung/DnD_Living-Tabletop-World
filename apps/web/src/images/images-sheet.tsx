import type { EntityKind, EntityRef } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';

import { Glyph } from '../visual/glyph.tsx';
import { useDmImages } from './dm-images.ts';
import { CandidateCard, ImagesResult, RequestRow } from './image-cards.tsx';
import { pendingWork } from './lineage.ts';

/**
 * The DM's Images sheet (docs/STAGE_330_DESIGN.md "DM controls"): every entity with pictures
 * waiting for approval, requests in progress or failed requests, across the campaign, with the
 * same controls as the entity's panel and a way to open that panel. Requests and candidates
 * are the DM's alone: players see a picture only after the DM approves it.
 */
export function ImagesSheet({
  directory,
  onShow,
}: {
  readonly directory: readonly EntityRef[];
  readonly onShow: (entityId: string, kind: EntityKind) => void;
}) {
  const t = useT();
  const images = useDmImages();
  if (!images) return null;
  const lineage = images.lineage.status === 'ready' ? images.lineage.value : null;
  const work = lineage ? pendingWork(lineage) : [];
  return (
    <div className="images-sheet">
      <p className="muted images-sheet-intro">
        {t(
          'Pictures reach players only after you approve them. Requests and candidates are yours alone.',
        )}
      </p>
      <ImagesResult place="sheet" />
      {!lineage ? (
        <StatusPanel
          state={images.lineage.status === 'error' ? 'error' : 'loading'}
          label={
            images.lineage.status === 'error' ? images.lineage.message : t('Reading the pictures…')
          }
          onRetry={images.retryRead}
        />
      ) : work.length === 0 ? (
        <StatusPanel
          state="empty"
          label={t('Nothing is waiting for you: no candidates and no requests in progress.')}
        />
      ) : (
        <ul className="images-work">
          {work.map(({ entityId, images: mine }) => {
            const entity = directory.find((item) => item.entityId === entityId);
            const kind = entity?.kind ?? 'item';
            const name = entity?.name ?? t('Unidentified subject');
            const context = {
              place: 'sheet',
              subject: (what: string) => t('{what} of {name}', { what, name }),
            };
            return (
              <li key={entityId} className="images-entity">
                <div className="images-entity-head">
                  <h3>{name}</h3>
                  {entity && <span className="directory-kind">{t(kind)}</span>}
                  {entity && (
                    <button
                      type="button"
                      className="images-entity-show"
                      onClick={() => {
                        onShow(entityId, kind);
                      }}
                    >
                      <Glyph name="look" />
                      {t('Show {name}', { name })}
                    </button>
                  )}
                </div>
                {mine.candidates.length > 0 && (
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
                )}
                {mine.working.length + mine.failed.length > 0 && (
                  <ul className="image-requests">
                    {[...mine.working, ...mine.failed].map((request) => (
                      <RequestRow key={request.requestId} request={request} context={context} />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
