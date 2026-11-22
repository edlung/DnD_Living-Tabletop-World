import { EMPTY_BOOK_PLACE, type BookPlace } from '@ltw/contracts';

/**
 * The DM's place in the campaign's book (docs/adr/0074-dm-book.md §3.4; migration 0049): the
 * ribbon, the chapters played, the DM's notes on a page. The DM's own data beside the world,
 * never canonical and never a player's to read. The in-memory store is the reference semantics
 * for the PostgreSQL one: one place a campaign, the last write kept.
 */
export interface BookPlaceStore {
  read(campaignId: string): Promise<BookPlace>;
  write(campaignId: string, place: BookPlace, at: string): Promise<void>;
}

export class InMemoryBookPlaceStore implements BookPlaceStore {
  readonly #places = new Map<string, BookPlace>();

  read(campaignId: string): Promise<BookPlace> {
    return Promise.resolve(this.#places.get(campaignId) ?? EMPTY_BOOK_PLACE);
  }

  write(campaignId: string, place: BookPlace): Promise<void> {
    this.#places.set(campaignId, structuredClone(place));
    return Promise.resolve();
  }
}
