import type { FlashbackResponse } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useEffect, useRef } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { formatWorldTime } from '../dm/world-time.ts';
import { useApprovedImage } from '../visual/approved-images.ts';
import { Glyph } from '../visual/glyph.tsx';
import { KnowledgeBadge } from '../visual/knowledge-cards.tsx';
import { ornamentUrl, textureUrl } from '../visual/ui-kit.ts';

/** The remembered place as the perspective saw it then: its approved image, or the mist. */
function Vignette({
  flashback,
  placeName,
}: {
  readonly flashback: FlashbackResponse;
  readonly placeName: string | null;
}) {
  const t = useT();
  const url = useApprovedImage(flashback.scene?.image ?? null);
  const corner = ornamentUrl('corner');
  return (
    <figure className={`flashback-vignette${url ? '' : ' flashback-vignette--mist'}`}>
      <img
        className="flashback-art"
        src={url ?? textureUrl('scene-fallback')}
        alt=""
        draggable={false}
      />
      {['tl', 'tr', 'bl', 'br'].map((at) => (
        <img
          key={at}
          className={`flashback-corner flashback-corner--${at}`}
          src={corner}
          alt=""
          aria-hidden="true"
        />
      ))}
      <figcaption>
        <span className="flashback-place">{placeName ?? t('A place you recall')}</span>
        <span>
          {formatWorldTime(flashback.worldTime, t)} · {t(flashback.phase)}
        </span>
        {!url && (
          <span className="flashback-note">{t('No approved picture of this place yet')}</span>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * A flashback played as a scene (docs/STAGE_320_DESIGN.md §5.6, ADR 0024 §7): a framed,
 * sepia-toned vignette of the remembered place (its approved image, or the neutral mist and a
 * note), the remembered line large in italic serif with its attribution and epistemic type —
 * or the memory's own summary when no account is quoted — who was there, and "Return". It
 * takes focus when it opens; Return (or Escape) goes back to the page that opened it.
 */
export function FlashbackScene({
  api,
  memoryId,
  placeName,
  onReturn,
}: {
  readonly api: WorldApi;
  readonly memoryId: string;
  /** The remembered place's name as the chapter tells it, when it names one. */
  readonly placeName: string | null;
  readonly onReturn: () => void;
}) {
  const t = useT();
  const region = useRef<HTMLElement>(null);
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<FlashbackResponse>(`memories/${encodeURIComponent(memoryId)}/flashback`, signal),
    [api, memoryId],
  );
  const { resource, retry } = useResource(`flashback:${memoryId}`, load);
  useEffect(() => {
    region.current?.focus({ preventScroll: true });
  }, []);
  const flashback = resource.status === 'ready' ? resource.value : null;
  const speaker = flashback?.dialogue.speaker ?? null;
  const others = (flashback?.participants ?? []).filter(
    (who) => who.entity.entityId !== speaker?.entityId,
  );
  return (
    <section
      ref={region}
      className="flashback-scene"
      aria-label={t('Flashback')}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        // Escape steps back to the book first; the book itself closes on the next one.
        event.preventDefault();
        event.stopPropagation();
        onReturn();
      }}
    >
      <p className="eyebrow flashback-eyebrow">
        <Glyph name="flashback" />
        {t('Flashback')}
      </p>
      {!flashback ? (
        <StatusPanel
          state={resource.status === 'error' ? 'error' : 'loading'}
          label={resource.status === 'error' ? resource.message : t('Remembering…')}
          onRetry={retry}
        />
      ) : (
        <>
          <Vignette flashback={flashback} placeName={placeName} />
          <blockquote className="flashback-line">
            <p>{t('“{line}”', { line: flashback.dialogue.text })}</p>
            <footer>
              {speaker ? (
                <span>{t('— {name}', { name: speaker.name })}</span>
              ) : (
                <span>{t('— from your memory')}</span>
              )}
              {flashback.dialogue.knowledgeType && (
                <KnowledgeBadge type={flashback.dialogue.knowledgeType} />
              )}
            </footer>
          </blockquote>
          {others.length > 0 && (
            <p className="flashback-with">
              {t('With {names}', { names: others.map((who) => who.entity.name).join(', ') })}
            </p>
          )}
        </>
      )}
      <button type="button" className="primary-button flashback-return" onClick={onReturn}>
        <Glyph name="chevron-left" />
        {t('Return')}
      </button>
    </section>
  );
}
