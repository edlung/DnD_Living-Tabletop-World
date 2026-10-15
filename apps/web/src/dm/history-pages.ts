import type { DmHistoryResponse } from '@ltw/contracts';

import type { WorldApi } from '../api/client.ts';

/**
 * The pages of the DM history (docs/adr/0033-live-session.md §7). A page is known by its place
 * in the list, never by its cursor: an entry added above moves the cursor of every older page
 * (the page above now ends one entry later), and a page known by its cursor would start over,
 * showing "Reading the history…" and closing the pages opened below it. Its cursor is read with
 * each read instead, and a moved cursor reads the page again in the background, which keeps its
 * rows until the new ones arrive.
 */
export const historyPageKey = (index: number): string => `dm-history:${String(index)}`;

/** Where a page starts: `before` of the page above it; the newest page has none. */
export class PageCursor {
  #before: number | null;

  constructor(before: number | null) {
    this.#before = before;
  }

  /** The query of a read now. */
  query(): Readonly<Record<string, string>> | undefined {
    return this.#before === null ? undefined : { before: String(this.#before) };
  }

  /** Follows the page above; true when this page must be read again from its new cursor. */
  follow(before: number | null): boolean {
    if (before === this.#before) return false;
    this.#before = before;
    return true;
  }
}

/** Reads the page from its cursor as it is when the read starts. */
export const historyPageLoader =
  (api: WorldApi, cursor: PageCursor) =>
  (signal: AbortSignal): Promise<DmHistoryResponse> =>
    api.get<DmHistoryResponse>('dm/history', signal, true, cursor.query());
