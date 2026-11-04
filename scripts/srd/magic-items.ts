import { SRD_MAGIC_CATEGORIES, type SrdMagicItem } from '../../packages/contracts/src/index.ts';
import { inReadingOrder, joinLines, pageLinesAt, slugOf, type PdfLine } from './text.ts';

/**
 * The SRD's Magic Items A–Z (pages 209–253) as entries (docs/adr/0054-items-as-data.md §1): name,
 * category and what it is made of, rarity, attunement and who may attune, and the text in its
 * paragraphs. An entry is a 12 pt heading followed by its category line ("Wondrous Item, Rare
 * (Requires Attunement)"), which may wrap; a 12 pt heading without one is part of an entry (the
 * Avatar of Death's "Traits"). A line it cannot read throws.
 */
export const MAGIC_CATEGORIES = SRD_MAGIC_CATEGORIES;
export type SrdMagicItemText = SrdMagicItem;

const PAGES = [209, 253] as const;
const ENTRY_PT = 12;
/** Tables are set in 9.5 pt, the text in 10. */
const TABLE_PT = 9.8;
/** A rarity, and what it is for: "(+1)", "(Silver or Brass)". */
const RARITY = '(?:Common|Uncommon|Rare|Very Rare|Legendary|Artifact)(?: \\((?!Requires)[^)]+\\))?';
const RARITIES = new RegExp(`^(?:Rarity Varies|${RARITY}(?:, ${RARITY})*(?:,? or ${RARITY})?)$`);
const CATEGORY = new RegExp(`^(${MAGIC_CATEGORIES.join('|')})(?: \\(([^)]*)\\))?, (.+)$`);
const ATTUNEMENT = /^(.*) \(Requires Attunement( by [^)]+)?\)$/;

/** A category line read whole, or null while it still runs on to the next line. */
export function categoryLine(
  text: string,
): Pick<SrdMagicItemText, 'category' | 'of' | 'rarity' | 'attunement'> | null {
  const attuned = ATTUNEMENT.exec(text);
  const line = attuned ? (attuned[1] ?? '') : text;
  const match = CATEGORY.exec(line);
  if (!match || !RARITIES.test(match[3] ?? '')) return null;
  return {
    category: match[1] as SrdMagicItemText['category'],
    of: match[2] ?? null,
    rarity: match[3] ?? '',
    attunement: attuned ? (attuned[2]?.trim() ?? '') : null,
  };
}

/** A category line's start: the first line after an entry's heading. */
const startsCategory = (text: string) =>
  MAGIC_CATEGORIES.some(
    (category) => text.startsWith(`${category},`) || text.startsWith(`${category} (`),
  );

/**
 * The pages' lines in reading order. A heading the PDF sets from the left column's middle though
 * it heads the right column's entry is put where its entry starts first.
 */
export function magicItemRows(dir: string): PdfLine[] {
  const rows: PdfLine[] = [];
  for (let page: number = PAGES[0]; page <= PAGES[1]; page += 1)
    rows.push(...inReadingOrder(pageLinesAt(dir, page).map(inItsColumn)));
  return rows;
}

export function inItsColumn(line: PdfLine): PdfLine {
  const heading = line.size >= ENTRY_PT - 0.5 && line.size < ENTRY_PT + 1;
  return heading && line.x0 < 294 && line.x1 > 500 ? { ...line, x0: 313.5 } : line;
}

export function parseMagicItems(rows: readonly PdfLine[]): SrdMagicItemText[] {
  const items: SrdMagicItemText[] = [];
  let index = rows.findIndex((row) => row.text === 'Magic Items A–Z');
  while (index < rows.length) {
    const row = rows[index];
    const next = rows[index + 1];
    if (row && next && isHeading(row) && startsCategory(next.text)) {
      const read = readItem(rows, index);
      items.push(read.item);
      index = read.next;
    } else index += 1;
  }
  return items;
}

const isHeading = (row: PdfLine) => Math.abs(row.size - ENTRY_PT) < 0.1;

/**
 * A category line that reads whole may still run on: "…, Uncommon (+1), Rare" goes on with
 * "(+2), or Very Rare (+3)". The text's first sentence never opens so.
 */
const runsOn = (next: string) =>
  /^(\(|or |Attunement\))/.test(next) ||
  /^(?:Very )?(?:Common|Uncommon|Rare|Legendary|Artifact)(?: \(|,| or|$)/.test(next);

function readItem(rows: readonly PdfLine[], at: number): { item: SrdMagicItemText; next: number } {
  const name = rows[at]?.text ?? '';
  let index = at + 1;
  let line = '';
  let category: ReturnType<typeof categoryLine> = null;
  while (index < rows.length && (category === null || runsOn(rows[index]?.text ?? ''))) {
    line = line === '' ? (rows[index]?.text ?? '') : `${line} ${rows[index]?.text ?? ''}`;
    index += 1;
    category = categoryLine(line);
    if (index - at > 4) throw new Error(`magic item "${name}": no category line in "${line}"`);
  }
  if (category === null) throw new Error(`magic item "${name}" has no category`);
  const body: PdfLine[] = [];
  while (index < rows.length) {
    const row = rows[index];
    const after = rows[index + 1];
    if (row && after && isHeading(row) && startsCategory(after.text)) break;
    if (row) body.push(row);
    index += 1;
  }
  return {
    item: { itemId: slugOf(name), name, ...category, text: paragraphs(body) },
    next: index,
  };
}

/**
 * Lines into paragraphs: a line set in from its column's edge, or a heading, starts one; a table's
 * row is a line of its own, a cell's wrapped words ("(greater)") staying with their row.
 */
function paragraphs(lines: readonly PdfLine[]): string {
  const out: string[][] = [];
  for (const line of lines) {
    const edge = line.x0 >= 294 ? 313.5 : 63;
    const indented = line.x0 > edge + 5 && line.x0 < edge + 12;
    const table = line.size < TABLE_PT && !/^\(/.test(line.text);
    const last = out[out.length - 1];
    if (!last || indented || table || line.size >= ENTRY_PT - 0.5) out.push([line.text]);
    else last.push(line.text);
  }
  return out.map((lines) => joinLines(lines)).join('\n');
}
