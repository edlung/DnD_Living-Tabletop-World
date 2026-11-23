import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import sharp from 'sharp';

/**
 * The books' materials (docs/adr/0075-book-interface.md §1.8): each campaign's book is bound,
 * printed and marked in its own campaign's style — the owner's words of 2026-11-23, «каждая книга
 * имеет свой стиль, согласно арту содержимого … картинки кампании и книги (страницы, переплет,
 * иконки) должны выглядеть гармонично». The originals are Codex CLI pictures kept outside the
 * repository, one folder a book: `<originals>/<theme>/<piece>.png`, `<theme>` a campaign theme's id
 * (`apps/web/src/visual/campaign-themes/catalog.json`) or `ltw`, the product's own binding.
 *
 * `node scripts/book-materials/build.ts <originals>` converts every known piece mechanically to
 * WebP in `apps/web/public/book-materials/<theme>/`, writes the manifest the client reads
 * (`apps/web/src/visual/book-materials/manifest.json`, with each file's SHA-256) and the stylesheet
 * that hands a book its materials (`book-materials.css`). Nothing is drawn or edited here.
 */
const ROOT = resolve(import.meta.dirname, '../..');
const PUBLIC = join(ROOT, 'apps/web/public/book-materials');
const CLIENT = join(ROOT, 'apps/web/src/visual/book-materials');

export const PARTS = [
  'story',
  'scene',
  'heroes',
  'hero',
  'world',
  'journal',
  'table',
  'rules',
] as const;
export const MOMENTS = ['talk', 'clue', 'letter', 'fight', 'puzzle'] as const;

/** A piece, the width it is shipped at, and the custom property that carries it (if any). */
const PIECES: Readonly<Record<string, { readonly width: number; readonly property?: string }>> = {
  cover: { width: 512, property: '--book-cover' },
  paper: { width: 512, property: '--book-paper' },
  tray: { width: 1200, property: '--book-tray' },
  ribbon: { width: 240, property: '--book-ribbon' },
  divider: { width: 640, property: '--book-divider' },
  emblem: { width: 256, property: '--book-emblem' },
  // The product's own (ADR 0075 §10): the bookcase of the shelf and the way in's ex libris.
  shelf: { width: 1600, property: '--book-shelf' },
  bookplate: { width: 768, property: '--book-bookplate' },
  ...Object.fromEntries(PARTS.map((part) => [`part-${part}`, { width: 128 }])),
  ...Object.fromEntries(MOMENTS.map((moment) => [`ico-${moment}`, { width: 128 }])),
};

/**
 * Pieces cut from another piece without changing a pixel: the shelf's middle board, laid under
 * each row of books (the region is in the original's pixels, 1536 × 1024).
 */
const CUTS: Readonly<
  Record<
    string,
    {
      readonly from: string;
      readonly region: { left: number; top: number; width: number; height: number };
      readonly width: number;
      readonly property: string;
    }
  >
> = {
  'shelf-board': {
    from: 'shelf',
    region: { left: 700, top: 616, width: 600, height: 46 },
    width: 600,
    property: '--book-shelf-board',
  },
};

interface ManifestBook {
  readonly theme: string;
  readonly pieces: Readonly<Record<string, string>>;
}

async function build(originals: string): Promise<ManifestBook[]> {
  const themes = new Set<string>(
    (
      JSON.parse(
        readFileSync(join(ROOT, 'apps/web/src/visual/campaign-themes/catalog.json'), 'utf8'),
      ) as {
        id: string;
      }[]
    ).map((theme) => theme.id),
  );
  themes.add('ltw');
  rmSync(PUBLIC, { recursive: true, force: true });
  const books: ManifestBook[] = [];
  for (const theme of readdirSync(originals).sort()) {
    if (!statSync(join(originals, theme)).isDirectory()) continue;
    if (!themes.has(theme)) throw new Error(`Unknown book theme: ${theme}`);
    const pieces: Record<string, string> = {};
    for (const file of readdirSync(join(originals, theme)).sort()) {
      const piece = file.replace(/\.png$/u, '');
      const spec = PIECES[piece];
      if (!file.endsWith('.png') || spec === undefined) continue;
      mkdirSync(join(PUBLIC, theme), { recursive: true });
      const out = join(PUBLIC, theme, `${piece}.webp`);
      await sharp(join(originals, theme, file))
        .resize({ width: spec.width, withoutEnlargement: true })
        .webp({ quality: 80, alphaQuality: 90, effort: 6 })
        .toFile(out);
      pieces[piece] = createHash('sha256').update(readFileSync(out)).digest('hex');
    }
    for (const [piece, cut] of Object.entries(CUTS)) {
      const source = join(originals, theme, `${cut.from}.png`);
      if (!existsSync(source)) continue;
      const out = join(PUBLIC, theme, `${piece}.webp`);
      await sharp(source)
        .extract(cut.region)
        .resize({ width: cut.width, withoutEnlargement: true })
        .webp({ quality: 80, effort: 6 })
        .toFile(out);
      pieces[piece] = createHash('sha256').update(readFileSync(out)).digest('hex');
    }
    books.push({ theme, pieces });
  }
  return books;
}

function stylesheet(books: readonly ManifestBook[]): string {
  const lines = [
    "/* Generated by scripts/book-materials/build.ts — do not edit. A book's own materials. */",
  ];
  for (const book of books) {
    const selector = book.theme === 'ltw' ? ':root' : `[data-campaign-theme='${book.theme}']`;
    const props = Object.keys(book.pieces).flatMap((piece) => {
      const property = PIECES[piece]?.property ?? CUTS[piece]?.property;
      return property ? [`  ${property}: url('/book-materials/${book.theme}/${piece}.webp');`] : [];
    });
    if (props.length > 0) lines.push(`${selector} {`, ...props, '}');
  }
  return `${lines.join('\n')}\n`;
}

const originals = process.argv[2];
if (originals) {
  const books = await build(resolve(originals));
  mkdirSync(CLIENT, { recursive: true });
  writeFileSync(join(CLIENT, 'manifest.json'), `${JSON.stringify({ books }, null, 1)}\n`);
  writeFileSync(join(CLIENT, 'book-materials.css'), stylesheet(books));
  const complete = books.filter((book) => PARTS.every((part) => `part-${part}` in book.pieces));
  process.stdout.write(`${books.length} books, ${complete.length} with every part's icon\n`);
}
