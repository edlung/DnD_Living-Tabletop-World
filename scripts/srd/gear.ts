import type { EquipmentKind, SrdEquipmentText, SrdToolText } from './equipment.ts';
import { PRICE, WEIGHT, priceCp, tableUnder, weightLb } from './tables.ts';
import { inReadingOrder, joinLines, pageLinesAt, slugOf, type PdfLine } from './text.ts';

/**
 * The SRD's tools (pages 93–94) and adventuring gear (pages 94–100) as entries (docs/adr/
 * 0054-items-as-data.md §1). Each is written as an entry — "Rope (1 GP)" and its words — and the
 * Adventuring Gear table gives the weights; the small tables inside an entry (Ammunition, Arcane
 * Focuses, Druidic Focuses, Holy Symbols) give the kinds a "Varies" entry is sold as. What a line
 * is follows from its type: entries in 12 pt, words in 10, tables in 9.5.
 */
const ENTRY = new RegExp(`^(.+) \\((Varies|${PRICE.source})\\)$`);
const SCROLL = new RegExp(
  `^Spell Scroll \\(Cantrip, (${PRICE.source}); Level 1, (${PRICE.source})\\)$`,
);
const ENTRY_PT = 12;
const BODY_PT = 10;
const TABLE_TITLE_PT = 10.5;

interface Entry {
  readonly name: string;
  readonly cost: string;
  readonly lines: string[];
  /** The rows of the small tables inside it, by their title. */
  readonly tables: Map<string, string[]>;
}

/** The entries of `lines` (in reading order) from the first 12 pt entry heading on. */
function entriesOf(lines: readonly PdfLine[]): Entry[] {
  const entries: Entry[] = [];
  let table: string | null = null;
  for (const line of lines) {
    const sized = line.size >= ENTRY_PT && line.size < ENTRY_PT + 1;
    // The Spell Scroll's entry prices its two kinds in one heading; they share its words.
    const scroll = sized ? SCROLL.exec(line.text) : null;
    if (scroll) {
      const shared = { lines: [] as string[], tables: new Map<string, string[]>() };
      entries.push({ name: 'Spell Scroll (Cantrip)', cost: scroll[1] ?? '', ...shared });
      entries.push({ name: 'Spell Scroll (Level 1)', cost: scroll[4] ?? '', ...shared });
      table = null;
      continue;
    }
    const heading = sized ? ENTRY.exec(line.text) : null;
    if (heading) {
      entries.push({
        name: heading[1] ?? '',
        cost: heading[2] ?? '',
        lines: [],
        tables: new Map(),
      });
      table = null;
      continue;
    }
    const current = entries[entries.length - 1];
    if (!current) continue;
    if (Math.abs(line.size - TABLE_TITLE_PT) < 0.1) {
      table = line.text;
      current.tables.set(table, []);
    } else if (line.size < BODY_PT && table !== null) {
      // A table's header row names its columns.
      if (!/ Cost$/.test(line.text)) current.tables.get(table)?.push(line.text);
    } else if (Math.abs(line.size - BODY_PT) < 0.1 || line.size < BODY_PT)
      current.lines.push(line.text);
    else if (line.size > ENTRY_PT) table = null;
  }
  return entries;
}

/** The tools' entries: "Ability: Intelligence Weight: 8 lb.", "Utilize: …", "Craft: …". */
export function parseTools(lines: readonly PdfLine[]): SrdEquipmentText[] {
  return entriesOf(lines).flatMap((found) => {
    const text = joinLines(found.lines);
    const ability = /^Ability: (\w+) Weight: (\S+(?: lb\.)?)/.exec(text);
    if (!ability) throw new Error(`tool "${found.name}" has no ability`);
    const utilize = /Utilize: (.+?)(?= Craft:| Variants:|$)/.exec(text)?.[1] ?? '';
    const craft = /Craft: (.+?)(?= Variants:|$)/.exec(text)?.[1] ?? null;
    const tool: SrdToolText = { ability: ability[1] ?? '', utilize, craft };
    const weight = weightLb(ability[2] ?? '—');
    const variants = /Variants: (.+)$/.exec(text)?.[1];
    const words = [
      `Ability: ${tool.ability}.`,
      `Utilize: ${utilize}.`,
      ...(craft ? [`Craft: ${craft}.`] : []),
    ].join(' ');
    if (variants === undefined)
      return [{ ...item(found.name, 'tool', priceCp(found.cost), weight, words), tool }];
    // "Dice (1 SP), …" or "Bagpipes (30 GP, 6 lb.), …": one entry for each.
    const kinds = new RegExp(`([^,(]+?) \\((${PRICE.source})(?:, (${WEIGHT.source}))?\\)`, 'g');
    return [...variants.matchAll(kinds)].map((kind) => {
      const name = capitalized((kind[1] ?? '').replace(/^and /, '').trim());
      const own = kind[5] === undefined ? weight : weightLb(kind[5]);
      return {
        ...item(`${name} (${found.name})`, 'tool', priceCp(kind[2] ?? ''), own, words),
        tool,
      };
    });
  });
}

/** The gear's entries, priced and weighed by the Adventuring Gear table's rows. */
export function parseGear(
  lines: readonly PdfLine[],
  tableRows: readonly string[],
): SrdEquipmentText[] {
  const weights = new Map<string, number | null>();
  for (const row of tableRows) {
    const match = new RegExp(`^(.+?) (${WEIGHT.source}) (Varies|${PRICE.source})$`).exec(row);
    if (!match) throw new Error(`gear row "${row}"`);
    weights.set(match[1] ?? '', weightLb(match[2] ?? '—'));
  }
  return entriesOf(lines).flatMap((found): SrdEquipmentText[] => {
    const text = joinLines(found.lines);
    const kinds = [...found.tables.entries()];
    if (found.cost === 'Varies')
      return kinds.flatMap(([title, rows]) => variantsOf(found.name, title, rows, text));
    const weight = weights.get(found.name);
    if (weight === undefined) throw new Error(`gear "${found.name}" is not in the table`);
    return [item(found.name, kindOf(found.name), priceCp(found.cost), weight, text)];
  });
}

/** A "Varies" entry's kinds from its table: ammunition bundles, focuses, holy symbols. */
function variantsOf(
  entry: string,
  title: string,
  rows: readonly string[],
  text: string,
): SrdEquipmentText[] {
  if (title === 'Ammunition')
    return rows.map((row) => {
      const match = new RegExp(`^(.+?) (\\d+) (\\w+) (${WEIGHT.source}) (${PRICE.source})$`).exec(
        row,
      );
      if (!match) throw new Error(`ammunition row "${row}"`);
      const amount = Number(match[2]);
      // One piece is an item; the table prices a bundle.
      const one = ONE_PIECE[match[1] ?? ''];
      if (one === undefined) throw new Error(`ammunition "${match[1] ?? ''}" has no single name`);
      return {
        ...item(one, 'ammunition', priceCp(match[5] ?? ''), weightLb(match[4] ?? '—'), text),
        bundle: { amount, storage: match[3] ?? '' },
      };
    });
  return rows.map((row) => {
    const match = new RegExp(`^(.+?) (${WEIGHT.source}) (${PRICE.source})$`).exec(row);
    if (!match) throw new Error(`${title} row "${row}"`);
    const kind = (match[1] ?? '').replace(/ \(also a Quarterstaff\)$/, '');
    const name = `${capitalized(kind.replace(/ \(.+\)$/, ''))} (${entry})`;
    return item(name, 'focus', priceCp(match[3] ?? ''), weightLb(match[2] ?? '—'), text);
  });
}

/** The Ammunition table's kinds by the piece. */
const ONE_PIECE: Readonly<Record<string, string>> = {
  Arrows: 'Arrow',
  Bolts: 'Bolt',
  'Bullets, Firearm': 'Firearm Bullet',
  'Bullets, Sling': 'Sling Bullet',
  Needles: 'Needle',
};

const PACK = /Pack$/;
const kindOf = (name: string): EquipmentKind => (PACK.test(name) ? 'pack' : 'gear');

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const item = (
  name: string,
  kind: EquipmentKind,
  costCp: number | null,
  weight: number | null,
  text: string,
): SrdEquipmentText => ({ itemId: slugOf(name), name, kind, costCp, weightLb: weight, text });

/**
 * The Tools and Adventuring Gear sections (pages 93–100): their entries, and the Adventuring Gear
 * table on page 95 for the weights. The table's page is no entry's.
 */
export function parseToolsAndGear(dir: string): SrdEquipmentText[] {
  const tools: PdfLine[] = [];
  const gear: PdfLine[] = [];
  let into: PdfLine[] | null = null;
  const pages = [93, 94, 96, 97, 98, 99, 100].map((page) =>
    inReadingOrder(pageLinesAt(dir, page).map(inItsColumn)),
  );
  for (const line of pages.flat()) {
    const section = line.size >= 18 ? line.text : null;
    if (section === 'Tools') into = tools;
    else if (section === 'Adventuring Gear') into = gear;
    else if (section !== null) into = null;
    else into?.push(line);
  }
  const page = pageLinesAt(dir, 95);
  const table = [
    ...tableUnder(
      page.filter((line) => line.x0 < 306),
      /^Item Weight Cost$/,
    ),
    ...tableUnder(
      page.filter((line) => line.x0 >= 306),
      /^Item Weight Cost$/,
    ),
  ].map((row) => row.text);
  return [...parseTools(tools), ...parseGear(gear, table)];
}

/**
 * A heading the PDF sets from the left column's middle though it heads the right column's entry
 * (Spell Scroll's, page 99): put where its entry starts, or the page's reading order breaks there.
 */
function inItsColumn(line: PdfLine): PdfLine {
  return /^Spell Scroll \(Cantrip,/.test(line.text) ? { ...line, x0: 313.5 } : line;
}
