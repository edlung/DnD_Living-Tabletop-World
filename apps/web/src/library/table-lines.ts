import { TABLE_RESULT_MAX, rangeGap, type DieSides, type TableResult } from '@ltw/contracts';

/**
 * A random table written as lines (docs/adr/0058-campaign-content.md §4): one result a line, its
 * range first — "1–2 Wolves", "3 A lone traveller", "00 The dragon" on a d100. Lines with no
 * number at all share the die evenly when their count divides it: six lines on a d6, ten on a d20.
 */
export type LinesProblem =
  | { readonly kind: 'empty' }
  | { readonly kind: 'too-many' }
  /** Line `line` (from 1) has no range, a range off the die, or text too long. */
  | { readonly kind: 'no-range' | 'off-die' | 'too-long'; readonly line: number }
  /** The ranges skip or repeat face `face`, or end before the die's last. */
  | { readonly kind: 'gap'; readonly face: number }
  /** Lines with no numbers whose count does not divide the die. */
  | { readonly kind: 'uneven'; readonly count: number };

export type ParsedLines =
  | { readonly ok: true; readonly results: readonly TableResult[] }
  | { readonly ok: false; readonly problem: LinesProblem };

const RANGED = /^\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?\s*[.:)]?\s+(\S.*)$/;
/** "00" is the hundred of a d100. */
const face = (digits: string): number => (digits === '00' ? 100 : Number(digits));

export function parseTableLines(text: string, die: DieSides): ParsedLines {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return { ok: false, problem: { kind: 'empty' } };
  if (lines.length > Math.min(die, 100)) return { ok: false, problem: { kind: 'too-many' } };
  const matched = lines.map((line) => RANGED.exec(line));
  if (matched.every((match) => match === null)) return evenly(lines, die);
  const results: TableResult[] = [];
  for (const [index, match] of matched.entries()) {
    const line = index + 1;
    if (!match) return { ok: false, problem: { kind: 'no-range', line } };
    const from = face(match[1] ?? '');
    const to = match[2] === undefined ? from : face(match[2]);
    const words = (match[3] ?? '').trim();
    if (from < 1 || to > die || to < from) return { ok: false, problem: { kind: 'off-die', line } };
    if (words.length > TABLE_RESULT_MAX) return { ok: false, problem: { kind: 'too-long', line } };
    results.push({ from, to, text: words });
  }
  const gap = rangeGap(die, results);
  return gap === null ? { ok: true, results } : { ok: false, problem: { kind: 'gap', face: gap } };
}

function evenly(lines: readonly string[], die: DieSides): ParsedLines {
  if (die % lines.length !== 0) {
    return { ok: false, problem: { kind: 'uneven', count: lines.length } };
  }
  const long = lines.findIndex((line) => line.length > TABLE_RESULT_MAX);
  if (long !== -1) return { ok: false, problem: { kind: 'too-long', line: long + 1 } };
  const width = die / lines.length;
  return {
    ok: true,
    results: lines.map((text, index) => ({
      from: index * width + 1,
      to: (index + 1) * width,
      text,
    })),
  };
}

/** A range as the table shows it: "3", "1–2". */
export const rangeWords = (result: TableResult): string =>
  result.from === result.to ? String(result.from) : `${String(result.from)}–${String(result.to)}`;

/** The lines a table is changed from: its ranges written first. */
export const tableLines = (results: readonly TableResult[]): string =>
  results.map((result) => `${rangeWords(result)} ${result.text}`).join('\n');

/** "d20": a die as the table names it. */
export const dieName = (die: DieSides): string => `d${String(die)}`;

/** A table's path in the DM's library, or one of its actions. */
export const tablePath = (entryId: string, action?: 'delete'): string =>
  `dm/library/tables/${encodeURIComponent(entryId)}${action ? `/${action}` : ''}`;
