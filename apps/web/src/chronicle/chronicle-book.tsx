import type { ChronicleEntryView, ChronicleListResponse, EntityRef } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';
import { textureUrl } from '../visual/ui-kit.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import { ChapterPages } from './chapter-pages.tsx';
import { FlashbackScene } from './flashback-scene.tsx';
import { GenerateChapter } from './generate-chapter.tsx';

interface Opened {
  readonly memoryId: string;
  readonly placeName: string | null;
  /** The control that opened it: Return gives focus back to it. */
  readonly opener: HTMLElement;
}

/**
 * The Chronicle as a book (docs/STAGE_320_DESIGN.md §5.6; ADR 0024): the GPT book spread scaled
 * to the screen, chapters as ribbon tabs, the chosen chapter on two facing pages, and a
 * memory's flashback played as a scene over the book. Chapters are told from the viewing
 * perspective's own memories; every word, type and source is shown as the server supplied it.
 * The DM writes a chapter from the book's header. Visual state (the chosen chapter, an open
 * flashback) lives here only; the book stays mounted while closed and is read again in the
 * background after the viewer's own actions, so the DM's draft title survives both.
 */
export function ChronicleBook({
  api,
  isDm,
  revision,
  directory,
}: {
  readonly api: WorldApi;
  readonly isDm: boolean;
  /** The world screen's count of the viewer's own actions. */
  readonly revision: number;
  readonly directory: readonly EntityRef[];
}) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => api.get<ChronicleListResponse>('chronicle', signal),
    [api],
  );
  const { resource, retry, reread } = useResource('chronicle', load);
  useRereadOn(revision, reread);
  const [chosen, setChosen] = useState<string | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const chapters = resource.status === 'ready' ? resource.value.chapters : [];
  // The chosen chapter, else the latest: a new chapter opens once it has been read.
  const chapter = chapters.find((entry) => entry.chronicleId === chosen) ?? chapters.at(-1) ?? null;
  const names = new Map(directory.map((entity) => [entity.entityId, entity.name]));
  const close = () => {
    const back = opened?.opener;
    setOpened(null);
    requestAnimationFrame(() => {
      if (back?.isConnected) back.focus({ preventScroll: true });
    });
  };
  return (
    <section className="chronicle-book" aria-label={t('Chronicle')}>
      <header className="book-header">
        <h2>
          <Glyph name="chronicle" />
          {t('Chronicle')}
        </h2>
        {isDm && (
          <GenerateChapter
            api={api}
            characters={directory.filter((entity) => entity.kind === 'character')}
            onWritten={(chronicleId) => {
              if (chronicleId) setChosen(chronicleId);
              reread();
            }}
          />
        )}
      </header>
      {chapters.length > 0 && (
        <nav className="book-ribbons" aria-label={t('Chapters')}>
          <div className="book-ribbon-list">
            {chapters.map((entry) => (
              <button
                key={entry.chronicleId}
                type="button"
                className="book-ribbon"
                aria-pressed={entry.chronicleId === chapter?.chronicleId}
                onClick={() => {
                  setChosen(entry.chronicleId);
                  setOpened(null);
                }}
              >
                <Glyph name="bookmark" />
                <span>{entry.title}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
      <div className="book-stage">
        <div className={`book-spread${opened ? ' is-remembering' : ''}`}>
          <img
            className="book-spread-art"
            src={textureUrl('book-spread')}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          {resource.status !== 'ready' ? (
            <div className="book-page book-page--left book-page--status">
              <StatusPanel
                state={resource.status}
                label={resource.status === 'error' ? resource.message : t('Opening the chronicle…')}
                onRetry={retry}
              />
            </div>
          ) : chapter === null ? (
            <div className="book-page book-page--left book-page--status">
              <p className="book-empty">{t('No chapter has been written for this view yet.')}</p>
              {isDm && (
                <p className="book-empty-hint">
                  {t('Write the first one from “Write a chapter” above.')}
                </p>
              )}
            </div>
          ) : (
            <div className="book-chapter-frame" hidden={opened !== null}>
              <ChapterPages
                key={chapter.chronicleId}
                api={api}
                chapter={chapter}
                isDm={isDm}
                names={names}
                onFlashback={(entry: ChronicleEntryView, opener) => {
                  if (entry.memoryId)
                    setOpened({
                      memoryId: entry.memoryId,
                      placeName: entry.location?.name ?? null,
                      opener,
                    });
                }}
              />
            </div>
          )}
          {opened && (
            <FlashbackScene
              key={opened.memoryId}
              api={api}
              memoryId={opened.memoryId}
              placeName={opened.placeName}
              onReturn={close}
            />
          )}
        </div>
      </div>
    </section>
  );
}
