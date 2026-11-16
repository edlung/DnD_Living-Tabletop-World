import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { WorldApi } from '../../api/client.ts';
import type { KeepsakeBook } from './book-model.ts';
import { PictureHoldsContext, type PictureHolds } from './book-pictures.tsx';
import { KeepsakePages } from './keepsake-pages.tsx';

/** How long the page settles after its last picture before printing, and the longest it waits. */
const SETTLE_MS = 150;
const LONGEST_WAIT_MS = 20_000;

/**
 * The book on paper (docs/adr/0072-keepsakes.md §1): the same page laid beside the application
 * for the printer alone — the stylesheet shows nothing else in print — with every picture read
 * and drawn before the browser's print opens, where "Save as PDF" is. A picture that cannot be
 * read in twenty seconds is printed without. It goes once the print is over.
 */
// (The cascade hides it on the screen: `.print-book` in `print-book.css`.)
export function PrintBook({
  api,
  name,
  book,
  waits,
  onDone,
}: {
  readonly api: WorldApi;
  readonly name: string;
  readonly book: KeepsakeBook;
  /**
   * Asked for by the page's button: the pictures are read and drawn for paper, then the print
   * opens. False when the browser's own print is already under way: the page is laid out as it
   * is, with the pictures already read, and opens nothing.
   */
  readonly waits: boolean;
  readonly onDone: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const held = useRef(0);
  const printed = useRef(false);
  // Counts each time the page holds nothing: the print waits for the last of them to stand.
  const [free, setFree] = useState(0);
  const holds = useMemo<PictureHolds>(
    () => ({
      hold: () => {
        held.current += 1;
        let released = false;
        return () => {
          if (released) return;
          released = true;
          held.current -= 1;
          if (held.current === 0) setFree((count) => count + 1);
        };
      },
    }),
    [],
  );
  const print = () => {
    if (printed.current || !waits) return;
    printed.current = true;
    window.print();
  };
  // A PDF saved from the print is named after the page: the campaign's name while it prints.
  useEffect(() => {
    const before = document.title;
    document.title = name;
    return () => {
      document.title = before;
    };
  }, [name]);
  useEffect(() => {
    window.addEventListener('afterprint', onDone);
    return () => {
      window.removeEventListener('afterprint', onDone);
    };
  }, [onDone]);
  useEffect(() => {
    // Whatever is not read by then is printed without.
    const longest = setTimeout(print, LONGEST_WAIT_MS);
    return () => {
      clearTimeout(longest);
    };
  }, []);
  useEffect(() => {
    if (held.current > 0) return;
    let current = true;
    const settle = setTimeout(() => {
      if (held.current > 0 || printed.current) return;
      const pictures = [...(root.current?.querySelectorAll('img') ?? [])];
      // Drawn, not only fetched: a picture still decoding prints as an empty frame.
      void Promise.all(pictures.map((picture) => picture.decode().catch(() => undefined))).then(
        () => {
          if (current && held.current === 0) print();
        },
      );
    }, SETTLE_MS);
    return () => {
      current = false;
      clearTimeout(settle);
    };
  }, [free]);
  return createPortal(
    <div ref={root} className="print-book">
      <PictureHoldsContext.Provider value={waits ? holds : null}>
        <KeepsakePages api={api} name={name} book={book} top={1} paper />
      </PictureHoldsContext.Provider>
    </div>,
    document.body,
  );
}
