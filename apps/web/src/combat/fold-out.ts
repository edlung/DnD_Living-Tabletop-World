import { usePaperSurface } from '../shell/sheet.tsx';

/**
 * The fight's surface (docs/adr/0075-book-interface.md §6, §17, §27): the book's paper wherever
 * the fight is in a book — the whole-screen sheet from a tablet up, and a phone's one column,
 * which lies on a page of the same paper (`styles/book-slips.css`). Outside a book (the table's
 * screen draws its own fight) there is none.
 */
export function useFoldOutSurface(): 'paper' | undefined {
  return usePaperSurface();
}
