import { createContext, useContext } from 'react';

import manifest from '../visual/book-materials/manifest.json' with { type: 'json' };
import '../visual/book-materials/book-materials.css';

/**
 * A book's own materials (docs/adr/0075-book-interface.md §1.8): the binding, the paper, the
 * ribbon, the dice tray and the icons of the book's parts, each drawn in its campaign's style
 * (`scripts/book-materials/build.ts`). The textures reach a book through custom properties set by
 * the campaign's theme (`book-materials.css`); the icons are pictures named here. A campaign whose
 * set is not drawn yet has no icons: its book shows the product's glyphs, never another book's set.
 */
export const BOOK_PARTS = [
  'story',
  'scene',
  'heroes',
  'hero',
  'world',
  'journal',
  'table',
  'rules',
] as const;
export type BookPart = (typeof BOOK_PARTS)[number];

export const BOOK_MOMENTS = ['talk', 'clue', 'letter', 'fight', 'puzzle'] as const;
export type BookMoment = (typeof BOOK_MOMENTS)[number];

/** The seals of the DM's working spread (docs/adr/0075-book-interface.md §16, §22). */
export const BOOK_SEALS = ['roll', 'fight', 'rest', 'screen', 'give'] as const;
export type BookSeal = (typeof BOOK_SEALS)[number];

/** The product's own binding: the shelf, the way in and the writer's desk. */
export const PRODUCT_BOOK = 'ltw';

const books = new Map(
  manifest.books.map((book) => [book.theme, new Set(Object.keys(book.pieces))]),
);

/** The published picture of a piece of a book's set, if that book has it. */
export function bookPiece(theme: string | null | undefined, piece: string): string | null {
  if (!theme) return null;
  return books.get(theme)?.has(piece) ? `/book-materials/${theme}/${piece}.webp` : null;
}

export const partIcon = (theme: string | null | undefined, part: BookPart) =>
  bookPiece(theme, `part-${part}`);

export const momentIcon = (theme: string | null | undefined, moment: BookMoment) =>
  bookPiece(theme, `ico-${moment}`);

/** A seal pressed in the book's own wax, where the book has it; the product's drawn wax else. */
export const sealPicture = (theme: string | null | undefined, seal: BookSeal) =>
  bookPiece(theme, `seal-${seal}`);

/** Which book is open: the campaign theme's id (`campaign-themes`), or none outside a campaign. */
export const BookThemeContext = createContext<string | null>(null);

export const useBookTheme = () => useContext(BookThemeContext);
