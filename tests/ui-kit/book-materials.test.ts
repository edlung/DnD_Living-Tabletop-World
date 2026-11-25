import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AGREEMENT_TONES,
  ROLL_MODES,
  SURPRISED_SIDES,
  TRAVEL_PACES,
  WEATHERS,
} from '../../packages/contracts/src/index.ts';
import { describe, expect, it } from 'vitest';

import catalog from '../../apps/web/src/visual/campaign-themes/catalog.json' with { type: 'json' };
import manifest from '../../apps/web/src/visual/book-materials/manifest.json' with { type: 'json' };
import {
  BOOK_PARTS,
  BOOK_SEALS,
  PRODUCT_BOOK,
  bookPiece,
  partIcon,
  sealPicture,
} from '../../apps/web/src/book-kit/materials.ts';

/**
 * The books' materials as shipped (`scripts/book-materials/build.ts`): every book is a campaign of
 * the catalogue or the product's own, every piece named is the file published with its digest,
 * and a book never borrows another book's set (docs/adr/0075-book-interface.md §1.8).
 */
const PUBLIC = join(import.meta.dirname, '../../apps/web/public/book-materials');
const THEMES = new Set(catalog.map((theme) => theme.id));

describe('the books’ materials', () => {
  it('names only the catalogue’s campaigns and the product’s own book', () => {
    for (const book of manifest.books) {
      expect(book.theme === PRODUCT_BOOK || THEMES.has(book.theme), book.theme).toBe(true);
    }
  });

  it('ships every piece it names, byte for byte', () => {
    for (const book of manifest.books) {
      for (const [piece, digest] of Object.entries(book.pieces)) {
        const file = join(PUBLIC, book.theme, `${piece}.webp`);
        expect(existsSync(file), file).toBe(true);
        expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(digest);
      }
    }
  });

  it('gives a book only its own pictures', () => {
    const book = manifest.books.find((entry) => entry.theme !== PRODUCT_BOOK);
    expect(book).toBeDefined();
    if (!book) return;
    for (const part of BOOK_PARTS) {
      const src = partIcon(book.theme, part);
      if (src !== null) expect(src.startsWith(`/book-materials/${book.theme}/`)).toBe(true);
    }
    expect(bookPiece('no-such-campaign', 'part-story')).toBeNull();
    expect(bookPiece(null, 'part-story')).toBeNull();
  });

  it('dresses a campaign through its theme’s custom properties', () => {
    const css = readFileSync(
      join(
        import.meta.dirname,
        '../../apps/web/src/visual/book-materials/generated/book-materials.css',
      ),
      'utf8',
    );
    for (const book of manifest.books) {
      if ('cover' in book.pieces && book.theme !== PRODUCT_BOOK) {
        expect(css).toContain(`[data-campaign-theme='${book.theme}']`);
        expect(css).toContain(`/book-materials/${book.theme}/cover.webp`);
      }
    }
  });

  // The second pass's details (docs/adr/0075-book-interface.md §22): three campaigns on trial.
  it('gives the three books on trial their own seals, initial, corner and edge', () => {
    const css = readFileSync(
      join(
        import.meta.dirname,
        '../../apps/web/src/visual/book-materials/generated/book-materials.css',
      ),
      'utf8',
    );
    for (const theme of ['lighthouse', 'rain-check', 'marrow-crown']) {
      for (const seal of BOOK_SEALS) {
        expect(sealPicture(theme, seal)).toBe(`/book-materials/${theme}/seal-${seal}.webp`);
      }
      for (const piece of ['initial', 'corner', 'edge']) {
        expect(bookPiece(theme, piece)).toBe(`/book-materials/${theme}/${piece}.webp`);
        expect(css).toContain(`--book-${piece}: url('/book-materials/${theme}/${piece}.webp');`);
      }
    }
  });

  it('leaves a book without those details with the product’s drawn ones', () => {
    const plain = manifest.books.find(
      (book) => book.theme !== PRODUCT_BOOK && !('seal-roll' in book.pieces),
    );
    expect(plain).toBeDefined();
    if (!plain) return;
    for (const seal of BOOK_SEALS) expect(sealPicture(plain.theme, seal)).toBeNull();
    expect(bookPiece(plain.theme, 'initial')).toBeNull();
    expect(sealPicture(null, 'roll')).toBeNull();
  });

  // The drawn choices and the trimmed pieces (docs/adr/0075-book-interface.md §25).
  it('has a picture in the product’s set for every choice and action the client draws', () => {
    const css = readFileSync(
      join(
        import.meta.dirname,
        '../../apps/web/src/visual/book-materials/generated/book-materials.css',
      ),
      'utf8',
    );
    const drawn = [
      ...['table', 'online'],
      ...AGREEMENT_TONES.map((tone) => `tone-${tone}`),
      ...ROLL_MODES.map((mode) => `roll-${mode}`),
      ...WEATHERS.map((weather) => `weather-${weather}`),
      ...['none', ...SURPRISED_SIDES].map((side) => `surprise-${side}`),
      ...TRAVEL_PACES.map((pace) => `pace-${pace}`),
      // What a screen may show (`CastKind`; `dm/cast-form.tsx` lists them in this order).
      ...[
        'scene',
        'battlefield',
        'dice',
        'title',
        'chronicle',
        'stars',
        'agreement',
        'picture',
        'story',
        'join',
        'blank',
      ].map((kind) => `cast-${kind}`),
      ...['damage', 'healing', 'temporary', 'reduce-maximum'].map((change) => `hp-${change}`),
      ...['hit-points', 'condition', 'inspiration', 'sheet'].map((action) => `act-${action}`),
      ...['short', 'long', 'dawn'].map((rest) => `rest-${rest}`),
      ...['turn', 'to-book', 'more-dice', 'evening', 'cross'],
      // A form's own marks, set by the stylesheet.
      ...['check-on', 'check-off', 'radio-on', 'radio-off', 'select-mark'],
    ];
    for (const pick of drawn) {
      expect(bookPiece(PRODUCT_BOOK, `pick-${pick}`), pick).toBe(
        `/book-materials/${PRODUCT_BOOK}/pick-${pick}.webp`,
      );
      expect(css, pick).toContain(
        `--pick-${pick}: url('/book-materials/${PRODUCT_BOOK}/pick-${pick}.webp');`,
      );
      expect(css, pick).toContain(`[data-pick='${pick}'] {`);
    }
  });

  it('trims a book’s ribbon to a band and its divider to a flourish', () => {
    const css = readFileSync(
      join(
        import.meta.dirname,
        '../../apps/web/src/visual/book-materials/generated/book-materials.css',
      ),
      'utf8',
    );
    for (const book of manifest.books) {
      const pieces: Record<string, string | undefined> = book.pieces;
      expect('ribbon-band' in pieces, book.theme).toBe('ribbon' in pieces);
      expect('flourish' in pieces, book.theme).toBe('divider' in pieces);
      if (pieces['flourish'] !== undefined && book.theme !== PRODUCT_BOOK) {
        // The ornament is set by its height: its book says so beside it.
        expect(css).toContain(
          `--book-flourish: url('/book-materials/${book.theme}/flourish.webp');\n  --book-flourish-size: auto 100%;`,
        );
      }
    }
  });
});
