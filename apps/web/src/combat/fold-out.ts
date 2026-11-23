import { usePaperSurface } from '../shell/sheet.tsx';
import { useMedia, WIDE } from './board/board-view.ts';

/**
 * The fight's surface (docs/adr/0075-book-interface.md §6): on the book's paper where the fight is
 * a fold-out over the whole spread (a wide screen); narrower, the fight runs as one column over the
 * dark stage and keeps its glass, which its words are measured against.
 */
export function useFoldOutSurface(): 'paper' | undefined {
  const paper = usePaperSurface();
  return useMedia(WIDE) ? paper : undefined;
}
