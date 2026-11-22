import { useSyncExternalStore } from 'react';

/**
 * Whether the campaign on screen has a book its DM can read (docs/adr/0074-dm-book.md §3.8). The
 * DM's sheets know; the dock, their sibling, asks here to show or leave out its Book button.
 */
let present = false;
const listeners = new Set<() => void>();

export function setBookPresent(next: boolean): void {
  if (present === next) return;
  present = next;
  for (const listener of listeners) listener();
}

export function useBookPresent(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => present,
  );
}
