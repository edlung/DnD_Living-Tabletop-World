import type { SrdBlock } from '../../packages/contracts/src/index.ts';
import {
  isTableHeader,
  isTableTitle,
  readTable,
  type SrdTable,
  type TableRegion,
  type TableSpec,
} from './reference-tables.ts';
import { joinLines, type PdfLine } from './text.ts';

/**
 * The SRD's rules text as blocks (docs/adr/0055-rules-reference-and-toolbox.md §1). A line set in
 * from its column's edge starts a paragraph, as the first line after a list or a table does; "•"
 * starts a bulleted item, whose next lines hang under its words; a "Trigger:" or "Duration:" line
 * is a paragraph of its own; a line of names in the glossary's sans face is a list of names (the
 * actions an Action names); a 10.5 pt title or a 9.3 pt header starts a table. A paragraph's
 * run-in head ("Fever.", "Trigger:") is kept apart from its words.
 */
const LEFT_EDGE = 63;
const RIGHT_EDGE = 313.5;
/** A sidebar's text ("Magic Item Rules") is set in 9 pt and 9.2 pt in from its column's edge. */
const SIDEBAR_INSET = 9.2;
const inSidebar = (line: PdfLine) => line.runs.some((run) => Math.abs(run.size - 9) < 0.3);
const edgeOf = (line: PdfLine) =>
  (line.x0 >= 294 ? RIGHT_EDGE : LEFT_EDGE) + (inSidebar(line) ? SIDEBAR_INSET : 0);
const LABELLED = /^(Trigger|Duration): /;

/**
 * What one reading of pages keeps between its sections: the tables read, by their spec (a header
 * that goes on in the next column adds to its table), and where they stood (a table's lines can
 * fall among the next section's in reading order).
 */
export interface ReadingSoFar {
  readonly tables: Map<TableSpec, SrdTable>;
  readonly regions: TableRegion[];
}
export const freshReading = (): ReadingSoFar => ({ tables: new Map(), regions: [] });

export function readBlocks(dir: string, rows: readonly PdfLine[], so: ReadingSoFar): SrdBlock[] {
  const blocks: SrdBlock[] = [];
  const { tables, regions } = so;
  // The block being read. A hanging paragraph ("Fever. The creature gains …") opens at the
  // column's edge and goes on set in; a plain one opens set in and goes on at the edge.
  const open: { kind: 'paragraph' | 'item' | null; lines: string[]; hanging: boolean } = {
    kind: null,
    lines: [],
    hanging: false,
  };
  const flush = () => {
    if (open.kind !== null && open.lines.length > 0)
      blocks.push(textBlock(open.kind, joinLines(open.lines)));
    open.kind = null;
    open.lines = [];
  };
  const start = (kind: 'paragraph' | 'item', text: string) => {
    flush();
    open.kind = kind;
    open.lines = [text];
  };
  const paragraph = (row: PdfLine, next: PdfLine | undefined) => {
    start('paragraph', row.text);
    open.hanging =
      stepOf(row) < 3 && next !== undefined && sameColumn(row, next) && isSetIn(stepOf(next));
  };
  const marked = withBullets(rows);
  for (const [index, row] of marked.entries()) {
    if (regions.some((region) => inRegion(row, region))) continue;
    const before = marked[index - 1];
    const next = marked[index + 1];
    if (isTableTitle(row) || isTableHeader(row)) {
      flush();
      const read = readTable(dir, row);
      regions.push(read.region);
      const before = tables.get(read.spec);
      if (read.continues && before) {
        before.rows.push(...read.rows);
        before.notes.push(...read.notes);
        continue;
      }
      const table: SrdTable = {
        kind: 'table',
        title: read.spec.title,
        columns: [...read.spec.columns],
        rows: read.rows,
        notes: read.notes,
      };
      tables.set(read.spec, table);
      blocks.push(table);
      continue;
    }
    if (isNames(row)) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'names') last.names.push(...namesOf(row));
      else blocks.push({ kind: 'names', names: namesOf(row) });
      continue;
    }
    const step = stepOf(row);
    // Space wider than a line's between two lines of one column parts paragraphs.
    const parted = before !== undefined && sameColumn(before, row) && before.y0 - row.y0 > 15;
    if (row.text.startsWith('•')) start('item', row.text.replace(/^•\s*/, ''));
    else if (open.kind === 'item' && step > 5 && step < 17 && !parted) open.lines.push(row.text);
    else if (open.kind !== 'paragraph' || parted || LABELLED.test(row.text)) paragraph(row, next);
    else if (open.hanging ? step < 3 : isSetIn(step)) paragraph(row, next);
    else open.lines.push(row.text);
  }
  flush();
  for (const block of blocks) if (block.kind === 'names') block.names.sort();
  return blocks;
}

/**
 * A bullet the page sets on its item's line joins it ("• The Frightened creature …"); one it sets
 * on its own, 6.7 pt under its item's first line (the encounter examples), is put on that line.
 */
const BULLET_DROP = 6.7;
function withBullets(rows: readonly PdfLine[]): PdfLine[] {
  const starts = new Set<PdfLine>();
  for (const bullet of rows.filter((row) => row.text === '•')) {
    const offset = (row: PdfLine) => Math.abs(row.y0 - bullet.y0 - BULLET_DROP);
    const first = rows
      .filter(
        (row) =>
          row.text !== '•' &&
          sameColumn(row, bullet) &&
          row.y0 - bullet.y0 > -2 &&
          row.y0 - bullet.y0 < 9,
      )
      .sort((a, b) => offset(a) - offset(b))[0];
    if (first) starts.add(first);
  }
  return rows
    .filter((row) => row.text !== '•')
    .map((row) => (starts.has(row) ? { ...row, text: `• ${row.text}` } : row));
}

const stepOf = (line: PdfLine) => line.x0 - edgeOf(line);
const isSetIn = (step: number) => step > 5 && step < 10;
const sameColumn = (a: PdfLine, b: PdfLine) => a.page === b.page && edgeOf(a) === edgeOf(b);

const inRegion = (row: PdfLine, region: TableRegion) =>
  row.page === region.page &&
  row.y0 <= region.top &&
  row.y0 >= region.bottom &&
  row.x0 >= region.left - 1 &&
  row.x1 <= region.right + 1;

/** A line of names set apart in the sans face ("Attack Dodge Influence Search"). */
const isNames = (row: PdfLine) =>
  row.runs.every(
    (run) => run.size === 0 || (run.font === 'GillSans' && Math.abs(run.size - 10) < 0.2),
  );

/** The names of a line, one per piece the page set apart. */
function namesOf(row: PdfLine): string[] {
  const names: string[] = [];
  let name = '';
  for (const run of row.runs) {
    if (run.size === 0) {
      if (name.trim() !== '') names.push(name.trim());
      name = '';
    } else name += run.text;
  }
  if (name.trim() !== '') names.push(name.trim());
  return names;
}

const SMALL = 'of|and|the|in|to|a|an|on|for|with|between|from|by|or|at|as|per|into|without';
/** A run-in head: a few capitalized words and a period or colon ("Detect and Disarm.", "Trigger:"). */
const HEAD = new RegExp(
  `^([A-Z0-9][\\w’'()/-]*(?: (?:[A-Z0-9][\\w’'()/-]*|${SMALL}))*)([.:]) (?=[A-Z0-9“"(])`,
);

export type SrdTextBlock = Extract<SrdBlock, { kind: 'paragraph' | 'item' }>;

export function textBlock(kind: 'paragraph' | 'item', text: string): SrdTextBlock {
  const match = HEAD.exec(text);
  const words = match?.[1];
  // A label keeps its colon ("Trigger:"); a head's period is the reader's to set.
  if (match && words !== undefined && words.split(' ').length <= 6)
    return {
      kind,
      head: match[2] === ':' ? `${words}:` : words,
      text: text.slice(match[0].length),
    };
  return { kind, head: null, text };
}
