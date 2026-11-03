import type { SrdBlock } from '../../packages/contracts/src/index.ts';
import { joinLines, pageLinesAt, type PdfLine } from './text.ts';

/**
 * The tables of the SRD's rules (docs/adr/0055-rules-reference-and-toolbox.md §1), read where
 * they stand on their page: under a 10.5 pt title or a 9.3 pt header, the 9.5 pt rows of the
 * title's column (or of the page, for a table as wide as it), down to the first gap no row
 * bridges. The PDF gives a row's cells as one piece or as several, so each table's columns and the
 * shape of its rows are written here; a row that does not read so is a cell's wrapped words, and a
 * row opening with "*" or "†" a footnote. A table set twice side by side ("Size Water Size Water")
 * reads its left half, then its right.
 */
export interface TableSpec {
  /** The 10.5 pt title, or null for a table that has only its header (a trap's tiers). */
  readonly title: string | null;
  /** The header's words as the page gives them, in reading order. */
  readonly header: string;
  readonly columns: readonly string[];
  /** A row's cells in its groups: the columns once, or twice for a table set side by side. */
  readonly row: RegExp;
  /** The column a cell's wrapped words belong to (by default the last). */
  readonly wraps?: number;
  /** The PDF's own slips in a row ("11,70 0"). */
  readonly fix?: (text: string) => string;
}

const SIZES = '(Tiny|Small|Medium|Large|Huge|Gargantuan)';
const TIER = '(\\d+–\\d+)';
const DAMAGE = '(\\d+ \\(\\d+d\\d+\\))';
const twice = (half: string) => new RegExp(`^${half}(?: ${half})?$`);

export const TABLE_SPECS: readonly TableSpec[] = [
  {
    title: 'Object Armor Class',
    header: 'AC Substance AC Substance',
    columns: ['AC', 'Substance'],
    row: /^(\d+) (\D+?)(?: (\d+) (\D+))?$/,
  },
  {
    title: 'Object Hit Points',
    header: 'Size Fragile Resilient',
    columns: ['Size', 'Fragile', 'Resilient'],
    row: new RegExp(`^(.+?\\)) ${DAMAGE} ${DAMAGE}$`),
  },
  {
    title: 'Carrying Capacity',
    header: 'Creature Size Carry Drag/Lift/Push',
    columns: ['Creature Size', 'Carry', 'Drag/Lift/Push'],
    row: /^(\S+) (Str\. × [\d.]+ lb\.) (Str\. × [\d.]+ lb\.)$/,
  },
  {
    title: 'Damage Types',
    header: 'Type Examples',
    columns: ['Type', 'Examples'],
    row: /^(Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder) (.+)$/,
  },
  {
    title: 'Water Needs per Day',
    header: 'Size Water Size Water',
    columns: ['Size', 'Water'],
    row: twice(`${SIZES} (.+?)`),
  },
  {
    title: 'Influence Checks',
    header: 'Ability Check Interaction',
    columns: ['Ability Check', 'Interaction'],
    row: /^((?:Charisma|Wisdom) \([^)]+\)) (.+)$/,
  },
  {
    title: 'Food Needs per Day',
    header: 'Size Food Size Food',
    columns: ['Size', 'Food'],
    row: twice(`${SIZES} (.+?)`),
  },
  {
    title: 'Search',
    header: 'Skill Thing to Detect',
    columns: ['Skill', 'Thing to Detect'],
    row: /^(Insight|Medicine|Perception|Survival) (.+)$/,
  },
  {
    title: 'Areas of Knowledge',
    header: 'Skill Areas',
    columns: ['Skill', 'Areas'],
    row: /^(Arcana|History|Investigation|Nature|Religion) (.+)$/,
  },
  {
    title: 'Travel Terrain',
    header: 'Terrain Maximum Pace Encounter Distance Foraging DC Navigation DC Search DC',
    columns: [
      'Terrain',
      'Maximum Pace',
      'Encounter Distance',
      'Foraging DC',
      'Navigation DC',
      'Search DC',
    ],
    row: /^(Arctic|Coastal|Desert|Forest|Grassland|Hill|Mountain|Swamp|Underdark|Urban|Waterborne) (\S+) (.+? feet|—) (\S+) (\S+) (\S+)$/,
  },
  {
    title: 'Sample Fear DCs',
    header: 'Example Save DC',
    columns: ['Example', 'Save DC'],
    row: /^(.+) (\d+)$/,
    wraps: 0,
  },
  {
    title: 'Sample Mental Stress Effects',
    header: 'Save Psychic Example DC Damage',
    columns: ['Example', 'Save DC', 'Psychic Damage'],
    row: /^(.+) (\d+) (\d+d\d+)$/,
    wraps: 0,
  },
  {
    title: null,
    header: 'Levels Bludgeoning Damage Save DC',
    columns: ['Levels', 'Bludgeoning Damage', 'Save DC'],
    row: new RegExp(`^${TIER} ${DAMAGE} (\\d+)$`),
  },
  {
    title: null,
    header: 'Levels Fire Damage Area of Effect',
    columns: ['Levels', 'Fire Damage', 'Area of Effect'],
    row: new RegExp(`^${TIER} ${DAMAGE} (.+)$`),
  },
  {
    title: null,
    header: 'Levels Pit Depth Bludgeoning Damage',
    columns: ['Levels', 'Pit Depth', 'Bludgeoning Damage'],
    row: new RegExp(`^${TIER} (\\d+ feet) ${DAMAGE}$`),
  },
  {
    title: null,
    header: 'Levels Poison Damage Save DC',
    columns: ['Levels', 'Poison Damage', 'Save DC'],
    row: new RegExp(`^${TIER} ${DAMAGE} (\\d+)$`),
  },
  {
    title: null,
    header: 'Levels Pit Depth Damage',
    columns: ['Levels', 'Pit Depth', 'Damage'],
    row: new RegExp(`^${TIER} (\\d+ feet) (.+)$`),
  },
  {
    title: 'XP Budget per Character',
    header: '——— Encounter Difficulty ——— Party’s Level Low Moderate High',
    columns: ['Party’s Level', 'Low', 'Moderate', 'High'],
    row: /^(\d+) ([\d,]+) ([\d,]+) ([\d,]+)$/,
    fix: (text) => text.replace(/(\d,\d\d) (\d)$/, '$1$2'),
  },
  {
    title: 'Magic Item Categories',
    header: 'Category Examples',
    columns: ['Category', 'Examples'],
    row: /^(Armor|Potions|Rings|Rods|Scrolls|Staffs|Wands|Weapons|Wondrous Items) (.+)$/,
  },
  {
    title: 'Potion Miscibility',
    header: '1d100 Result',
    columns: ['1d100', 'Result'],
    row: /^(\d\d(?:–\d\d)?) (.+)$/,
  },
  {
    title: 'Magic Item Rarities and Values',
    header: 'Rarity Value* Rarity Value*',
    columns: ['Rarity', 'Value*'],
    row: /^(Common|Uncommon|Rare) ([\d,]+ GP) (Very Rare|Legendary|Artifact) ([\d,]+ GP|Priceless)$/,
  },
  {
    title: 'Magic Item Tools',
    header: 'Item Category Required Tool',
    columns: ['Item Category', 'Required Tool'],
    row: /^(Armor|Potion|Ring|Rod|Scroll|Staff|Wand|Weapon|Wondrous Item) (.+)$/,
  },
  {
    title: 'Magic Item Crafting Time and Cost',
    header: 'Item Rarity Time* Cost*',
    columns: ['Item Rarity', 'Time*', 'Cost*'],
    row: /^(Common|Uncommon|Rare|Very Rare|Legendary) (\d+ days) ([\d,]+ GP)$/,
  },
  {
    title: 'Sentient Item’s Alignment',
    header: '1d100 Alignment 1d100 Alignment',
    columns: ['1d100', 'Alignment'],
    row: twice('(\\d\\d–\\d\\d) (.+?)'),
  },
  {
    title: 'Sentient Item’s Communication',
    header: '1d10 Communication',
    columns: ['1d10', 'Communication'],
    row: /^(\d+(?:–\d+)?) (.+)$/,
  },
  {
    title: 'Sentient Item’s Senses',
    header: '1d4 Senses',
    columns: ['1d4', 'Senses'],
    row: /^(\d) (.+)$/,
  },
  {
    title: 'Sentient Item’s Special Purpose',
    header: '1d10 Special Purpose',
    columns: ['1d10', 'Special Purpose'],
    row: /^(\d+) (.+)$/,
  },
];

export type SrdTable = Extract<SrdBlock, { kind: 'table' }>;

/** Where a table stood, so the page's running text skips its lines. */
export interface TableRegion {
  readonly page: number;
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/** A table's own lines and what it holds: a new table, or a header that goes on with one. */
export interface ReadTable {
  readonly spec: TableSpec;
  /** True when it is only a header and its rows (a table that runs on into the next column). */
  readonly continues: boolean;
  readonly rows: string[][];
  readonly notes: string[];
  readonly region: TableRegion;
}

const SAME_ROW = 2;
const TABLE_END = 24;
const GUTTER = 306;
const TITLE_PT = 10.5;
const HEADER_PT = 9.3;

const bold = (line: PdfLine) => line.runs.some((run) => /SemiBold|Bold/.test(run.font));
export const isTableTitle = (line: PdfLine) => bold(line) && Math.abs(line.size - TITLE_PT) < 0.1;
export const isTableHeader = (line: PdfLine) =>
  line.runs.some((run) => /SemiBold/.test(run.font) && Math.abs(run.size - HEADER_PT) < 0.15);
const wide = (line: PdfLine) => line.x0 < GUTTER - 12 && line.x1 > GUTTER + 12;

/** The table a title or a header line starts, read from its page where its lines stand. */
export function readTable(dir: string, start: PdfLine): ReadTable {
  const lines = pageLinesAt(dir, start.page);
  const left = start.x0 < GUTTER ? 55 : GUTTER - 1;
  const below = (line: PdfLine) => line.y0 < start.y0 - 0.5;
  const ownColumn = (line: PdfLine) => start.x0 < GUTTER === line.x0 < GUTTER;
  const firstHeader = isTableHeader(start)
    ? start
    : lines
        .filter((line) => below(line) && isTableHeader(line) && ownColumn(line))
        .sort((a, b) => b.y0 - a.y0)[0];
  const band = firstHeader && wide(firstHeader) ? [55, 560] : [left, left + 251];
  const inBand = (line: PdfLine) => line.x0 >= (band[0] ?? 0) - 1 && line.x1 <= (band[1] ?? 0) + 1;
  // The page's own lines: `start` is its line in reading order, a copy of one of these.
  const ordered = lines
    .filter((line) => line.y0 < start.y0 + 0.5 && inBand(line))
    .sort((a, b) => b.y0 - a.y0 || a.x0 - b.x0);
  const headers: PdfLine[] = [];
  const groups: PdfLine[][] = [];
  let above = start.y0;
  for (const line of ordered) {
    if (isTableTitle(line) && Math.abs(line.y0 - start.y0) < 0.5) continue;
    if (above - line.y0 > TABLE_END) break;
    if (line.size >= 10 && !isTableHeader(line)) break;
    above = line.y0;
    if (isTableHeader(line)) {
      headers.push(line);
      continue;
    }
    const last = groups[groups.length - 1];
    const first = last?.[0];
    if (last && first && Math.abs(first.y0 - line.y0) < SAME_ROW) last.push(line);
    else groups.push([line]);
  }
  const title = isTableTitle(start) ? start.text : null;
  const header = headers.map((line) => line.text).join(' ');
  const spec =
    TABLE_SPECS.find((one) => title !== null && one.title === title) ??
    TABLE_SPECS.find((one) => one.header === header);
  if (!spec) throw new Error(`page ${String(start.page)}: no table spec for "${title ?? header}"`);
  const { rows, notes } = cellsOf(spec, groups);
  const bottom = Math.min(...[...headers, ...groups.flat()].map((line) => line.y0));
  return {
    spec,
    continues: title === null && spec.title !== null,
    rows,
    notes,
    // A table as wide as the page starts at its header: the other column runs on beside its title.
    region: {
      page: start.page,
      top: (firstHeader && wide(firstHeader) ? firstHeader.y0 : start.y0) + 0.5,
      bottom: bottom - 0.5,
      left: band[0] ?? 0,
      right: band[1] ?? 0,
    },
  };
}

function cellsOf(spec: TableSpec, groups: readonly PdfLine[][]) {
  const left: string[][] = [];
  const right: string[][] = [];
  const notes: string[][] = [];
  const width = spec.columns.length;
  const wraps = spec.wraps ?? width - 1;
  let last: string[][] | null = null;
  for (const group of groups) {
    const raw = [...group]
      .sort((a, b) => a.x0 - b.x0)
      .map((line) => line.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const text = spec.fix ? spec.fix(raw) : raw;
    if (/^[*†]/.test(text) || (notes.length > 0 && last === null)) {
      if (/^[*†]/.test(text)) notes.push([text]);
      else notes[notes.length - 1]?.push(text);
      last = null;
      continue;
    }
    const match = spec.row.exec(text);
    if (match) {
      // A group the row leaves out (a table's right half on its last row) is undefined.
      const cells: (string | undefined)[] = match.slice(1);
      left.push(cells.slice(0, width).map((cell) => cell ?? ''));
      const second = cells.slice(width);
      if (second.length > 0 && second[0] !== undefined)
        right.push(second.map((cell) => cell ?? ''));
      last = [left[left.length - 1] ?? []];
      continue;
    }
    // A cell's wrapped words: they go with the row above.
    const row = left[left.length - 1];
    if (!row)
      throw new Error(`table "${spec.title ?? spec.header}": a first row "${text}" no cell holds`);
    row[wraps] = joinLines([row[wraps] ?? '', text]);
  }
  return { rows: [...left, ...right], notes: notes.map((lines) => joinLines(lines)) };
}
