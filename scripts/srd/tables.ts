import type { PdfLine } from './text.ts';

/**
 * The SRD's tables as the import reads them (docs/adr/0054-items-as-data.md §1): the rows under a
 * table's header line, its cells joined left to right, and the prices and weights its cells write.
 * A table's lines are read where they stand: two tables side by side, or a row split into pieces,
 * must not be put in a column's reading order.
 */
export interface TableRow {
  readonly text: string;
  /** Where the row's first piece starts. */
  readonly x0: number;
  /** How far right of its header it starts: an indented row is a kind of the group above it. */
  readonly indent: number;
  readonly y0: number;
  /** Set in italics: a group's heading inside the table ("Simple Melee Weapons"). */
  readonly italic: boolean;
}

/** Pieces whose bottoms lie this close are one row; a gap this wide ends the table. */
const SAME_ROW = 2;
const TABLE_END = 24;
/** Table text is set in 9.5 pt; the body in 10. */
const TABLE_SIZE = 10;

/**
 * The rows under the first line of `lines` that `header` matches: the lines within its width and
 * in table type, from the header down to the first gap a row never leaves.
 */
export function tableUnder(lines: readonly PdfLine[], header: RegExp, slack = 12): TableRow[] {
  const head = lines.find((line) => header.test(line.text));
  if (!head) throw new Error(`no table header ${String(header)}`);
  const inside = lines
    .filter(
      (line) =>
        line !== head &&
        line.y0 < head.y0 - SAME_ROW &&
        line.size < TABLE_SIZE &&
        line.x0 >= head.x0 - slack &&
        line.x1 <= head.x1 + slack,
    )
    .sort((a, b) => b.y0 - a.y0 || a.x0 - b.x0);
  const rows: PdfLine[][] = [];
  let above = head.y0;
  for (const line of inside) {
    const last = rows[rows.length - 1];
    const first = last?.[0];
    if (first && Math.abs(first.y0 - line.y0) < SAME_ROW) last.push(line);
    else {
      if (above - line.y0 > TABLE_END) break;
      rows.push([line]);
    }
    above = line.y0;
  }
  return rows.map((pieces) => {
    const ordered = [...pieces].sort((a, b) => a.x0 - b.x0);
    return {
      text: ordered
        .map((piece) => piece.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
      x0: ordered[0]?.x0 ?? 0,
      indent: (ordered[0]?.x0 ?? head.x0) - head.x0,
      y0: ordered[0]?.y0 ?? 0,
      italic: ordered.every((piece) => piece.runs.every((run) => /Italic/i.test(run.font))),
    };
  });
}

const COIN_CP = { CP: 1, SP: 10, EP: 50, GP: 100, PP: 1000 } as const;
export const PRICE = /(\d[\d,]*) (CP|SP|EP|GP|PP)/;

/** A price in copper pieces ("1,500 GP" → 150000); null for "Varies". */
export function priceCp(text: string): number | null {
  if (/^Varies$/.test(text.trim())) return null;
  const match = new RegExp(`^${PRICE.source}$`).exec(text.trim());
  if (!match) throw new Error(`not a price: "${text}"`);
  return Number((match[1] ?? '').replaceAll(',', '')) * COIN_CP[match[2] as keyof typeof COIN_CP];
}

/** A weight in pounds ("1/4 lb." → 0.25, "58½ lb." → 58.5); null for "—" or "Varies". */
export function weightLb(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '—' || trimmed === 'Varies') return null;
  const match = /^(\d[\d,]*)?(½|\/\d+|\s?\d\/\d+)? lb\.(?: \(full\))?$/.exec(trimmed);
  if (!match) throw new Error(`not a weight: "${text}"`);
  const whole = match[1] === undefined ? 0 : Number(match[1].replaceAll(',', ''));
  const part = match[2];
  if (part === undefined) return whole;
  if (part === '½') return whole + 0.5;
  // "1/4" reads as 1 and "/4".
  if (part.startsWith('/')) return whole / Number(part.slice(1));
  const [top, bottom] = part.trim().split('/').map(Number);
  return whole + (top ?? 0) / (bottom ?? 1);
}

/** A weight cell: a weight, "—" or "Varies". */
export const WEIGHT = /—|Varies|\d[\d,]*(?:½|\/\d+)? lb\.(?: \(full\))?/;

/**
 * Rows with their groups: an unindented row with no price above indented ones names a group
 * ("Saddle", "Wine (bottle)"), and the indented rows are its kinds — a group may run on into the
 * next table. The group's own row is left out.
 */
export function grouped(
  rows: readonly TableRow[],
): { readonly row: TableRow; readonly group: string | null }[] {
  let group: string | null = null;
  return rows.flatMap((row, index) => {
    if (row.indent > 4) return [{ row, group }];
    const next = rows[index + 1];
    if (next !== undefined && next.indent > 4 && !PRICE.test(row.text)) {
      group = row.text;
      return [];
    }
    group = null;
    return [{ row, group: null }];
  });
}
