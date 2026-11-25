import { usePaperSurface } from '../shell/sheet.tsx';
import { NARROW, useMedia } from './board/board-view.ts';

/**
 * The fight's surface (docs/adr/0075-book-interface.md §6, §17): on the book's paper where the
 * fight is a fold-out — a wide screen, and a tablet, where the map takes the page. On a phone, or
 * a phone held wide, the fight runs as one column over the dark stage and keeps its glass, which
 * its words are measured against.
 */
export function useFoldOutSurface(): 'paper' | undefined {
  const paper = usePaperSurface();
  return useMedia(NARROW) ? undefined : paper;
}
