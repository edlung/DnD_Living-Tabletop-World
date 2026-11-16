import type { ChronicleEntryView, ChronicleListResponse, EntityRef } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';
import { textureUrl } from '../visual/ui-kit.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import { PARTY, bookChapters } from './book-chapters.ts';
import { ChapterPages } from './chapter-pages.tsx';
import { FlashbackScene } from './flashback-scene.tsx';
import { GenerateChapter } from './generate-chapter.tsx';
import { KeepsakeView } from './keepsake/keepsake-view.tsx';

interface Opened {
  readonly memoryId: string;
  readonly placeName: string | null;
  /** A party chapter's memory: its scene is read in the party's view. */
  readonly party: boolean;
  /** The control that opened it: Return gives focus back to it. */
  readonly opener: HTMLElement;
}

/**
 * The Chronicle as a book (docs/STAGE_320_DESIGN.md §5.6; ADR 0024): the GPT book spread scaled
 * to the screen, chapters as ribbon tabs, the chosen chapter on two facing pages, and a
 * memory's flashback played as a scene over the book. Chapters are told from the viewing
 * perspective's own memories, and a player's book also holds the party's (ADR 0071 §1), read in
 * the party's view; every word, type and source is shown as the server supplied it.
 * The DM writes a chapter from the book's header. Visual state (the chosen chapter, an open
 * flashback) lives here only; the book stays mounted while closed and is read again in the
 * background after the viewer's own actions and on the live signal, so the DM's draft title
 * survives both. The chapter first shown stays the one shown: a chapter written meanwhile
 * never replaces the page being read (its place, an open flashback), its ribbon says "New".
 * "The whole book" shows the campaign's book instead of the spread (ADR 0072 §1): the party's
 * chapters as one page, whoever reads.
 */
export function ChronicleBook({
  api,
  isDm,
  revision,
  directory,
  open,
  wanted,
  whole,
  onWhole,
}: {
  readonly api: WorldApi;
  readonly isDm: boolean;
  /** The world screen's count of the viewer's own actions. */
  readonly revision: number;
  readonly directory: readonly EntityRef[];
  /** The book is open: what it shows now is what the reader sees. */
  readonly open: boolean;
  /** A chapter the book was asked to open at (a recap's "Read on"); each asking is a new object. */
  readonly wanted: { readonly chronicleId: string } | null;
  /** The whole book is shown instead of the chapters' spread. */
  readonly whole: boolean;
  readonly onWhole: (whole: boolean) => void;
}) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => api.get<ChronicleListResponse>('chronicle', signal),
    [api],
  );
  const own = useResource('chronicle', load);
  // The party's chapters, which a player may read as PARTY; the DM's list already holds them.
  const partyApi = useMemo(() => api.as(PARTY), [api]);
  const alsoParty = !isDm && api.perspective !== PARTY;
  const loadParty = useCallback(
    (signal: AbortSignal) =>
      alsoParty ? partyApi.get<ChronicleListResponse>('chronicle', signal) : Promise.resolve(null),
    [partyApi, alsoParty],
  );
  const shared = useResource(`chronicle-party:${String(alsoParty)}`, loadParty);
  const reread = () => {
    own.reread();
    shared.reread();
  };
  const retry = () => {
    own.retry();
    shared.retry();
  };
  useRereadOn(revision, reread);
  // One book once both lists are read: a chapter must not arrive late and look newly written. The
  // party's list failing leaves the reader's own book.
  const resource =
    own.resource.status === 'ready' && shared.resource.status === 'loading'
      ? ({ status: 'loading' } as const)
      : own.resource;
  const ownChapters = own.resource.status === 'ready' ? own.resource.value.chapters : null;
  const partyChapters = shared.resource.status === 'ready' ? shared.resource.value?.chapters : null;
  const book = useMemo(
    () => (resource.status === 'ready' ? bookChapters(ownChapters ?? [], partyChapters ?? []) : []),
    [resource.status, ownChapters, partyChapters],
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  // The chapters the reader has met: those in the book when it first showed, and each shown since.
  const [met, setMet] = useState<ReadonlySet<string> | null>(null);
  const chapters = book.map((entry) => entry.chapter);
  // A player reads a party chapter's pages in the party's view; the DM reads all as the DM.
  const readsAsParty = (chronicleId: string | null) =>
    !isDm && book.some((entry) => entry.party && entry.chapter.chronicleId === chronicleId);
  // The chosen chapter, else the latest (before anything is shown, or when the chosen one is gone).
  const chapter = chapters.find((entry) => entry.chronicleId === chosen) ?? chapters.at(-1) ?? null;
  const shownId = chapter?.chronicleId ?? null;
  const ids = chapters.map((entry) => entry.chronicleId).join('\n');
  // Once the reader sees a chapter it stays chosen; it and every chapter then present are met.
  // A chosen chapter not listed yet (the DM's own, still being read) waits; one met and no
  // longer listed (undone) gives way to the chapter shown instead.
  useEffect(() => {
    if (!open || resource.status !== 'ready') return;
    const gone = chosen !== null && met?.has(chosen) === true && !ids.split('\n').includes(chosen);
    if (shownId !== null && (chosen === null || gone)) setChosen(shownId);
    setMet((known) => {
      if (known === null) return new Set(ids === '' ? [] : ids.split('\n'));
      return shownId === null || known.has(shownId) ? known : new Set([...known, shownId]);
    });
  }, [open, resource.status, shownId, ids, chosen]);
  // Asked to open at a chapter: it becomes the chosen one (and waits if it is not read yet).
  useEffect(() => {
    if (wanted === null) return;
    setChosen(wanted.chronicleId);
    setOpened(null);
  }, [wanted]);
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
        <div className="book-views" role="group" aria-label={t('What the Chronicle shows')}>
          {([false, true] as const).map((choice) => (
            <button
              key={String(choice)}
              type="button"
              aria-pressed={whole === choice}
              onClick={() => {
                onWhole(choice);
              }}
            >
              {choice ? t('The whole book') : t('By chapter')}
            </button>
          ))}
        </div>
        {isDm && !whole && (
          <GenerateChapter
            api={api}
            characters={directory.filter((entity) => entity.kind === 'character')}
            written={chapters.length}
            onWritten={(chronicleId) => {
              if (chronicleId) setChosen(chronicleId);
              reread();
            }}
          />
        )}
      </header>
      <KeepsakeView api={api} shown={open && whole} revision={revision} />
      {chapters.length > 0 && !whole && (
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
                {met !== null && !met.has(entry.chronicleId) && (
                  <small className="book-ribbon-new">{t('New')}</small>
                )}
              </button>
            ))}
          </div>
        </nav>
      )}
      <div className="book-stage" hidden={whole}>
        <div className={`book-spread${opened ? ' is-remembering' : ''}`}>
          <img
            className="book-spread-art"
            src={textureUrl('book-spread')}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <span className="book-veil book-veil--left" aria-hidden="true" />
          <span className="book-veil book-veil--right" aria-hidden="true" />
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
            // Behind a flashback the pages stay laid out (unseen, inert), keeping their place.
            <div
              className={`book-chapter-frame${opened ? ' is-behind' : ''}`}
              inert={opened !== null}
            >
              <ChapterPages
                key={chapter.chronicleId}
                api={readsAsParty(chapter.chronicleId) ? partyApi : api}
                chapter={chapter}
                isDm={isDm}
                teller={isDm || readsAsParty(chapter.chronicleId)}
                names={names}
                onFlashback={(entry: ChronicleEntryView, opener) => {
                  if (entry.memoryId)
                    setOpened({
                      memoryId: entry.memoryId,
                      placeName: entry.location?.name ?? null,
                      party: readsAsParty(chapter.chronicleId),
                      opener,
                    });
                }}
              />
            </div>
          )}
          {opened && (
            <FlashbackScene
              key={opened.memoryId}
              api={opened.party ? partyApi : api}
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
