import type { CampaignBook, OpenedBook } from '@ltw/contracts';
import { useSyncExternalStore } from 'react';

/**
 * The DM's open book, held for the card of someone chosen on the Scene
 * (docs/adr/0075-book-interface.md §16): the card opens with how the campaign tells that person.
 * The book is read by the DM's screen alone (`use-book.ts`) and held only while that screen is
 * mounted; nothing here reaches a player's perspective, which never asks for it.
 */
let held: OpenedBook | null = null;
const listeners = new Set<() => void>();

export function holdBook(book: OpenedBook | null): void {
  if (held === book) return;
  held = book;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * The book's person an entity of the world is, for the DM; null for anyone and anything else. A
 * book assembled from the world tells a person only by the world's own description, which the card
 * shows just below: it is not said twice.
 */
export function useToldPerson(
  entityId: string,
  dm: boolean,
): CampaignBook['people'][number] | null {
  const book = useSyncExternalStore(subscribe, () => held);
  if (!dm || !book || book.content.assembled === true) return null;
  const key = Object.entries(book.ids.entities).find(([, id]) => id === entityId)?.[0];
  return book.content.people.find((person) => person.key === key) ?? null;
}
