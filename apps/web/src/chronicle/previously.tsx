import type { ChronicleChapterView, ChronicleListResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect, useId, useMemo, useRef, type ReactNode } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useRereadOn } from '../world/use-world-data.ts';
import { PARTY, newestPartyChapter, recapParagraphs } from './book-chapters.ts';
import { mainPlace } from './chapter-facts.ts';
import { PlacePlate } from './chapter-pages.tsx';

/**
 * "Previously…" (docs/adr/0071-memory-and-ritual.md §1.4): the newest chapter told from the Party,
 * read in the party's view by whoever looks — a player, the DM, the table's screen. Null until it
 * is read and when the party has no chapter. `enabled` false reads nothing.
 */
export function usePreviously(
  api: WorldApi,
  enabled: boolean,
  revision = 0,
): { readonly api: WorldApi; readonly chapter: ChronicleChapterView | null } {
  const party = useMemo(() => api.as(PARTY), [api]);
  const load = useCallback(
    (signal: AbortSignal) =>
      enabled ? party.get<ChronicleListResponse>('chronicle', signal) : Promise.resolve(null),
    [party, enabled],
  );
  const read = useResource(`previously:${String(enabled)}`, load);
  useRereadOn(revision, read.reread);
  const chapters = read.resource.status === 'ready' ? read.resource.value?.chapters : null;
  return { api: party, chapter: chapters ? newestPartyChapter(chapters) : null };
}

/** Longer prose is set smaller on the table's screen, which cannot scroll. */
const LONG_RECAP = 700;

/**
 * The recap itself: the chapter's title, the picture of its main place as the party saw it when
 * the chapter ends, and its first passages exactly as written. `api` is the party's view.
 * `heading` is the level of its title where it stands.
 */
export function Previously({
  api,
  chapter,
  heading: Heading = 'h3',
  className = '',
  focus = false,
  children,
}: {
  readonly api: WorldApi;
  readonly chapter: ChronicleChapterView;
  readonly heading?: 'h1' | 'h2' | 'h3' | 'h4';
  readonly className?: string;
  /** Opened by a control that it replaced: its title takes focus. */
  readonly focus?: boolean;
  /** The card's own controls, after the prose. */
  readonly children?: ReactNode;
}) {
  const t = useT();
  const ids = useId();
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) title.current?.focus();
  }, [focus]);
  const passages = recapParagraphs(chapter);
  const long = passages.join('').length > LONG_RECAP;
  return (
    <article
      className={`previously${long ? ' previously--long' : ''} ${className}`.trimEnd()}
      aria-labelledby={`${ids}-title`}
    >
      <PlacePlate api={api} place={mainPlace(chapter)} at={chapter.to} />
      <div className="previously-words">
        <p className="previously-eyebrow">
          <Glyph name="chronicle" />
          {t('Previously…')}
        </p>
        <Heading id={`${ids}-title`} ref={title} tabIndex={focus ? -1 : undefined}>
          {chapter.title}
        </Heading>
        {passages.map((text, index) => (
          <p key={index} className="previously-passage">
            {text}
          </p>
        ))}
        {children}
      </div>
    </article>
  );
}
