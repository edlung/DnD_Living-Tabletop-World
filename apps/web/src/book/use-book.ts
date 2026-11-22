import type { BookPlace, CampaignBookResponse, OpenedBook } from '@ltw/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';

/**
 * The campaign's book for its DM (docs/adr/0074-dm-book.md §3): read once when the DM's screen
 * loads and again each time the book is opened, never on every change of the world — the book is
 * the campaign's text, and only its found clues move. The DM's place is kept here and written to
 * the server a moment after it changes; a write that failed is said and tried again with the next.
 */
export interface DmBook {
  /** Null while it loads, when the campaign has no book, and for anyone but the DM. */
  readonly opened: OpenedBook | null;
  readonly place: BookPlace;
  readonly setPlace: (change: (place: BookPlace) => BookPlace) => void;
  /** The last write of the place did not reach the server. */
  readonly unsaved: boolean;
  /** Reads the book again (its found clues): asked for when the book is opened. */
  readonly reread: () => void;
}

const EMPTY: BookPlace = { ribbon: null, played: [], notes: {} };
const WRITE_AFTER_MS = 600;

export function useDmBook(api: WorldApi, isDm: boolean): DmBook {
  // Everything is held for one campaign's API: another campaign in the same tab starts empty.
  const [held, setHeld] = useState<{
    readonly api: WorldApi;
    readonly opened: OpenedBook | null;
    readonly place: BookPlace;
    /** The DM changed the place here: a re-read never takes that back. */
    readonly touched: boolean;
  }>({ api, opened: null, place: EMPTY, touched: false });
  const current = held.api === api ? held : { api, opened: null, place: EMPTY, touched: false };
  const [unsaved, setUnsaved] = useState(false);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!isDm) return;
    const abort = new AbortController();
    api
      .get<CampaignBookResponse>('dm/book', abort.signal, false)
      .then(({ book }) => {
        setHeld((before) => {
          const mine =
            before.api === api ? before : { api, opened: null, place: EMPTY, touched: false };
          return { ...mine, opened: book, place: book && !mine.touched ? book.place : mine.place };
        });
      })
      .catch(() => undefined);
    return () => {
      abort.abort();
    };
  }, [api, isDm, round]);

  const pending = useRef<{ place: BookPlace; timer: ReturnType<typeof setTimeout> } | null>(null);
  const write = useCallback(
    (next: BookPlace) => {
      api
        .post('dm/book/place', next, AbortSignal.timeout(20_000))
        .then(() => {
          setUnsaved(false);
        })
        .catch(() => {
          setUnsaved(true);
        });
    },
    [api],
  );
  const flush = useCallback(() => {
    const waiting = pending.current;
    if (!waiting) return;
    clearTimeout(waiting.timer);
    pending.current = null;
    write(waiting.place);
  }, [write]);
  // Leaving this campaign (or the screen) writes what still waits, to the campaign it was for.
  useEffect(() => flush, [flush]);

  const setPlace = useCallback(
    (change: (place: BookPlace) => BookPlace) => {
      setHeld((before) => {
        const mine =
          before.api === api ? before : { api, opened: null, place: EMPTY, touched: false };
        const next = change(mine.place);
        if (next === mine.place) return before;
        if (pending.current) clearTimeout(pending.current.timer);
        pending.current = { place: next, timer: setTimeout(flush, WRITE_AFTER_MS) };
        return { ...mine, place: next, touched: true };
      });
    },
    [api, flush],
  );
  const reread = useCallback(() => {
    setRound((value) => value + 1);
  }, []);
  return {
    opened: isDm ? current.opened : null,
    place: current.place,
    setPlace,
    unsaved,
    reread,
  };
}
