import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { WorldApi } from '../../api/client.ts';
import { nativeShell } from '../../native/shell.ts';
import { KeepsakePages } from './keepsake-pages.tsx';
import { PrintBook } from './print-book.tsx';
import { useBook } from './use-book.ts';

/**
 * The whole book inside the Chronicle (docs/adr/0072-keepsakes.md §1): one page that scrolls,
 * with "Print or save as PDF" at its head where a browser can print (the native apps learn it in
 * Stage 750). Read as the party whoever looks, while it is shown and not otherwise; once read it
 * stays laid out behind the chapters, so coming back finds the place it was left at. The
 * browser's own print command, given while the page is shown, prints the book as well: laid out
 * at that moment with the pictures already read.
 */
export function KeepsakeView({
  api,
  shown,
  revision,
}: {
  readonly api: WorldApi;
  /** The page is what the reader looks at now. */
  readonly shown: boolean;
  readonly revision: number;
}) {
  const t = useT();
  const { api: party, book: read, resource, retry } = useBook(api, shown, revision);
  // Paper: asked for by the page's button, which waits for the pictures, or by the browser.
  const [printing, setPrinting] = useState<'button' | 'browser' | null>(null);
  const done = useCallback(() => {
    setPrinting(null);
  }, []);
  const page = useRef<HTMLDivElement>(null);
  const place = useRef(0);
  const printable = nativeShell() === null && read !== null && read.book.evenings.length > 0;
  // Says whether more of the page lies below, for an edge that fades; keeps the reader's place.
  useEffect(() => {
    const box = page.current;
    if (!shown || read === null || !box) return undefined;
    const measure = () => {
      place.current = box.scrollTop;
      box.toggleAttribute(
        'data-more-after',
        box.scrollTop + box.clientHeight < box.scrollHeight - 1,
      );
    };
    measure();
    box.addEventListener('scroll', measure, { passive: true });
    const resized = new ResizeObserver(measure);
    resized.observe(box);
    for (const child of box.children) resized.observe(child);
    return () => {
      box.removeEventListener('scroll', measure);
      resized.disconnect();
    };
  }, [shown, read === null]);
  // A page that was put away is not laid out and forgets where it stood: it is told again.
  useLayoutEffect(() => {
    if (shown && page.current) page.current.scrollTop = place.current;
  }, [shown]);
  useEffect(() => {
    if (!shown || !printable) return undefined;
    const before = () => {
      // The page must be there before the browser lays the paper out.
      flushSync(() => {
        setPrinting((asked) => asked ?? 'browser');
      });
    };
    window.addEventListener('beforeprint', before);
    return () => {
      window.removeEventListener('beforeprint', before);
    };
  }, [shown, printable]);
  if (read === null) {
    if (!shown) return null;
    return (
      <div className="keepsake-stage">
        <div className="keepsake-scroll keepsake-scroll--status">
          <StatusPanel
            state={resource.status === 'error' ? 'error' : 'loading'}
            label={resource.status === 'error' ? resource.message : t('Opening the book…')}
            onRetry={retry}
          />
        </div>
      </div>
    );
  }
  return (
    <div className="keepsake-stage" hidden={!shown}>
      <div
        ref={page}
        className="keepsake-scroll"
        role="region"
        aria-label={t('The book of the campaign')}
        tabIndex={0}
      >
        {printable && (
          <div className="keepsake-tools">
            <button
              type="button"
              aria-disabled={printing === 'button'}
              onClick={() => {
                setPrinting('button');
              }}
            >
              {printing === 'button' ? t('Preparing the pages…') : t('Print or save as PDF')}
            </button>
            <p role="status">{printing === 'button' ? t('Loading the pictures…') : ''}</p>
          </div>
        )}
        <KeepsakePages api={party} name={read.name} book={read.book} top={3} />
      </div>
      {printing !== null && (
        <PrintBook
          api={party}
          name={read.name}
          book={read.book}
          waits={printing === 'button'}
          onDone={done}
        />
      )}
    </div>
  );
}
