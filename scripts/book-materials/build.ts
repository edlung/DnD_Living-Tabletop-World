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
 * that hands a book its materials (`generated/book-materials.css`). Nothing is drawn or edited here.
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
/** The seals of the DM's working spread (docs/adr/0075-book-interface.md §16, §22). */
export const SEALS = ['roll', 'fight', 'rest', 'screen', 'give'] as const;
/** The dice of a page's foot and of the Dice page, drawn in the book's own style (§24). */
export const DICE = [4, 6, 8, 10, 12, 20, 100] as const;

/** A piece, the width it is shipped at, and the custom property that carries it (if any). */
const PIECES: Readonly<Record<string, { readonly width: number; readonly property?: string }>> = {
  cover: { width: 512, property: '--book-cover' },
  paper: { width: 512, property: '--book-paper' },
  tray: { width: 1200, property: '--book-tray' },
  ribbon: { width: 240, property: '--book-ribbon' },
  divider: { width: 640, property: '--book-divider' },
  emblem: { width: 256, property: '--book-emblem' },
  // The product's own (ADR 0075 §10–11): the shelf's bookcase, the way in's ex libris, the desk.
  shelf: { width: 1600, property: '--book-shelf' },
  desk: { width: 1600, property: '--book-desk' },
  bookplate: { width: 768, property: '--book-bookplate' },
  ...Object.fromEntries(PARTS.map((part) => [`part-${part}`, { width: 128 }])),
  ...Object.fromEntries(MOMENTS.map((moment) => [`ico-${moment}`, { width: 128 }])),
  // The second pass's details (ADR 0075 §22): the plate a chapter's initial is printed on, and
  // the working spread's seals.
  initial: { width: 256, property: '--book-initial' },
  ...Object.fromEntries(SEALS.map((seal) => [`seal-${seal}`, { width: 160 }])),
  // The whole-screen book (ADR 0075 §24): a die a picture, where a book has them one by one.
  ...Object.fromEntries(DICE.map((sides) => [`die-d${String(sides)}`, { width: 144 }])),
};

/**
 * Pieces put together from a book's pictures without drawing anything (ADR 0075 §24). The
 * cover's frame is one corner fitting turned to each corner of a square whose sides stay empty,
 * so it serves a screen of any size as a border image. A set of dice drawn as one row on one
 * sheet (so the set is of one material) is cut into its six dice, left to right, where nothing
 * is painted between them; the d100 is the d10 again.
 */
const FRAME = { side: 600, corner: 276, property: '--book-cover-frame' } as const;
const SHEET_DICE = [4, 6, 8, 10, 12, 20] as const;

async function coverFrame(source: string, out: string): Promise<void> {
  const corner = await sharp(await sharp(source).trim({ threshold: 8 }).toBuffer())
    .resize(FRAME.corner, FRAME.corner, {
      fit: 'contain',
      position: 'left top',
      background: '#00000000',
    })
    .png()
    .toBuffer();
  const turned = (angle: number) => sharp(corner).rotate(angle).png().toBuffer();
  const far = FRAME.side - FRAME.corner;
  await sharp({
    create: { width: FRAME.side, height: FRAME.side, channels: 4, background: '#00000000' },
  })
    .composite([
      { input: corner, left: 0, top: 0 },
      { input: await turned(90), left: far, top: 0 },
      { input: await turned(180), left: far, top: far },
      { input: await turned(270), left: 0, top: far },
    ])
    .webp({ quality: 80, alphaQuality: 90, effort: 6 })
    .toFile(out);
}

/** The painted stretches of a sheet along its width: where a column holds any paint. */
async function paintedRuns(source: string): Promise<{ left: number; width: number }[]> {
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const painted = Array.from({ length: info.width }, (_, x) => {
    for (let y = 0; y < info.height; y += 1) {
      if ((data[(y * info.width + x) * info.channels + 3] ?? 0) > 24) return true;
    }
    return false;
  });
  const runs: { left: number; width: number }[] = [];
  let start = -1;
  for (let x = 0; x <= info.width; x += 1) {
    if (x < info.width && painted[x]) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      // A speck is not a die.
      if (x - start >= info.width / 40) runs.push({ left: start, width: x - start });
      start = -1;
    }
  }
  return runs;
}

async function diceFromSheet(
  source: string,
  theme: string,
  write: (piece: string, picture: ReturnType<typeof sharp>) => Promise<void>,
): Promise<void> {
  const runs = await paintedRuns(source);
  if (runs.length !== SHEET_DICE.length) {
    throw new Error(
      `${theme}: the dice sheet holds ${String(runs.length)} separate pictures, not ${String(SHEET_DICE.length)}`,
    );
  }
  const height = (await sharp(source).metadata()).height;
  // One step at a time: a trim asked for with a cut is taken before it, and the cut then misses.
  const die = async (index: number) => {
    const run = runs[index];
    if (!run) throw new Error(`${theme}: no die ${String(index)} on the sheet`);
    const cut = await sharp(source)
      .extract({ left: run.left, top: 0, width: run.width, height })
      .png()
      .toBuffer();
    const trimmed = await sharp(cut).trim({ threshold: 8 }).png().toBuffer();
    return sharp(trimmed).resize(144, 144, { fit: 'contain', background: '#00000000' });
  };
  for (const [index, sides] of SHEET_DICE.entries()) {
    await write(`die-d${String(sides)}`, await die(index));
  }
  await write('die-d100', await die(SHEET_DICE.indexOf(10)));
}

/**
 * Pieces that are another piece without its empty margins (ADR 0075 §25): a ribbon drawn down the
 * middle of its sheet is a band that fills the gutter's ribbon whole, and the ornament of a
 * chapter's title is as wide as its own flourish, so a page sets it by its height.
 */
const TRIMS: Readonly<
  Record<string, { readonly from: string; readonly width: number; readonly property: string }>
> = {
  'ribbon-band': { from: 'ribbon', width: 96, property: '--book-ribbon-band' },
  flourish: { from: 'divider', width: 640, property: '--book-flourish' },
};

/**
 * The drawn choices and actions (§25): a vignette for an option of a form or for an action, named
 * `pick-<key>.png` in a book's folder. The product's own set has them all; a book may bring its
 * own for any of them. An element names its picture (`data-pick`) and the stylesheet hands it in.
 */
const PICK = /^pick-[a-z0-9-]+$/u;
const PICK_WIDTH = 160;

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
  // A page's corner ornament: the original (1254 × 1254) keeps it in its top-left corner.
  corner: {
    from: 'corner',
    region: { left: 0, top: 0, width: 512, height: 512 },
    width: 256,
    property: '--book-corner',
  },
  // The edge of the block of pages: a band from the middle of the painted fore-edge (2172 × 724).
  edge: {
    from: 'edge',
    region: { left: 0, top: 262, width: 2172, height: 200 },
    width: 1086,
    property: '--book-edge',
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
      const spec = PIECES[piece] ?? (PICK.test(piece) ? { width: PICK_WIDTH } : undefined);
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
    for (const [piece, trim] of Object.entries(TRIMS)) {
      const source = join(originals, theme, `${trim.from}.png`);
      if (!existsSync(source)) continue;
      const out = join(PUBLIC, theme, `${piece}.webp`);
      // One step at a time: a resize asked for with a trim is taken before it.
      const tight = await sharp(source).trim({ threshold: 8 }).png().toBuffer();
      await sharp(tight)
        .resize({ width: trim.width, withoutEnlargement: true })
        .webp({ quality: 80, alphaQuality: 90, effort: 6 })
        .toFile(out);
      pieces[piece] = createHash('sha256').update(readFileSync(out)).digest('hex');
    }
    const fitting = join(originals, theme, 'cover-corner.png');
    if (existsSync(fitting)) {
      const out = join(PUBLIC, theme, 'cover-frame.webp');
      await coverFrame(fitting, out);
      pieces['cover-frame'] = createHash('sha256').update(readFileSync(out)).digest('hex');
    }
    const sheet = join(originals, theme, 'dice.png');
    if (existsSync(sheet) && !('die-d20' in pieces)) {
      await diceFromSheet(sheet, theme, async (piece, picture) => {
        const out = join(PUBLIC, theme, `${piece}.webp`);
        await picture.webp({ quality: 80, alphaQuality: 90, effort: 6 }).toFile(out);
        pieces[piece] = createHash('sha256').update(readFileSync(out)).digest('hex');
      });
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
      const property =
        PIECES[piece]?.property ??
        CUTS[piece]?.property ??
        TRIMS[piece]?.property ??
        (piece === 'cover-frame' ? FRAME.property : undefined);
      if (!property) return [];
      const picture = `  ${property}: url('/book-materials/${book.theme}/${piece}.webp');`;
      // The ornament is set by its height; the hairline that stands in for it, by its width.
      return piece === 'flourish' ? [picture, '  --book-flourish-size: auto 100%;'] : [picture];
    });
    if (props.length > 0) lines.push(`${selector} {`, ...props, '}');
  }
  // The drawn choices: each a named property of the product's set, or of a book's own over it,
  // and an element that names its picture (`data-pick`) takes it from there.
  const named = new Set<string>();
  for (const book of books) {
    const picks = Object.keys(book.pieces).filter((piece) => PICK.test(piece));
    if (picks.length === 0) continue;
    const selector = book.theme === 'ltw' ? ':root' : `[data-campaign-theme='${book.theme}']`;
    lines.push(
      `${selector} {`,
      ...picks.map((piece) => `  --${piece}: url('/book-materials/${book.theme}/${piece}.webp');`),
      '}',
    );
    for (const piece of picks) named.add(piece);
  }
  for (const piece of [...named].sort()) {
    lines.push(`[data-pick='${piece.slice('pick-'.length)}'] {`, `  --pick: var(--${piece});`, '}');
  }
  return `${lines.join('\n')}\n`;
}

const originals = process.argv[2];
if (originals) {
  const books = await build(resolve(originals));
  mkdirSync(CLIENT, { recursive: true });
  writeFileSync(join(CLIENT, 'manifest.json'), `${JSON.stringify({ books }, null, 1)}\n`);
  mkdirSync(join(CLIENT, 'generated'), { recursive: true });
  writeFileSync(join(CLIENT, 'generated', 'book-materials.css'), stylesheet(books));
  const complete = books.filter((book) => PARTS.every((part) => `part-${part}` in book.pieces));
  process.stdout.write(`${books.length} books, ${complete.length} with every part's icon\n`);
}
