import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The SRD 5.2.1's text as the import reads it (docs/adr/0051-srd-data.md §1): the lines PDFKit
 * found on each page with their bounds and fonts (`page-NNN.jsonl`, scripts/srd/pdflines.swift),
 * put in reading order, the running footers dropped, words a line break split joined again.
 */
export interface PdfRun {
  readonly font: string;
  readonly size: number;
  readonly text: string;
}

export interface PdfLine {
  readonly page: number;
  /** Bounds in PDF points, the origin at the page's bottom left. */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /** The largest type on the line, in points. */
  readonly size: number;
  readonly runs: readonly PdfRun[];
  readonly text: string;
}

const FOOTER = /^(\d+\s+)?System Reference Document 5\.2\.1$/;
/** The middle of a Letter page (612 pt), between the SRD's two columns. */
const GUTTER = 306;
/** Lines of one column whose bottoms lie this close are one line. */
const BASELINE = 1.5;

interface RawLine {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly runs: readonly PdfRun[];
}

/** Pages `from`–`to` as lines in reading order, footers and page numbers dropped. */
export function pageRows(dir: string, from: number, to: number): PdfLine[] {
  const rows: PdfLine[] = [];
  for (let page = from; page <= to; page += 1) {
    const file = readFileSync(join(dir, `page-${String(page).padStart(3, '0')}.jsonl`), 'utf8');
    const lines = file
      .split('\n')
      .filter((row) => row.trim() !== '')
      .map((row) => placed(page, JSON.parse(row) as RawLine))
      .filter((line) => !FOOTER.test(line.text) && !(/^\d+$/.test(line.text) && line.y0 < 60));
    rows.push(...inReadingOrder(lines));
  }
  return rows;
}

function placed(page: number, raw: RawLine): PdfLine {
  // A soft hyphen inside a word ("Meta\u00ADmagic") is no letter.
  const runs = raw.runs.map((run) => ({ ...run, text: run.text.replace(/\u00AD/g, '') }));
  const size = Math.max(...runs.map((run) => run.size));
  // The body text of some chapters reports a box 5.6 times its size, reaching 31 pt below its
  // baseline and 25 above (10 pt type in a 55.8 pt box): it is put back on its line.
  const box = raw.y1 - raw.y0;
  const baseline = raw.y0 + (box > 3 * size ? 0.556 * box : 0.2 * box);
  const bottom = baseline - 0.23 * size;
  const text = runs
    .map((run) => run.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return { page, x0: raw.x0, y0: bottom, x1: raw.x1, y1: bottom + size, size, runs, text };
}

/** The text of pages `from`–`to`, one entry per line in reading order. */
export const pageLines = (dir: string, from: number, to: number): string[] =>
  pageRows(dir, from, to).map((line) => line.text);

/**
 * A line's text and how it opens: in bold italic, an entry's name ("Bite." of a stat block); in
 * bold upright, a label ("At Will:" of a spell list).
 */
export interface SrdLine {
  readonly text: string;
  readonly lead: string | null;
  readonly label: string | null;
}

const BOLD_ITALIC = /Bold.*Italic|BoldIt/i;
const BOLD = /Bold/i;

export function srdLine(line: PdfLine): SrdLine {
  const lead = opening(line, (font) => BOLD_ITALIC.test(font));
  const label =
    lead === null ? opening(line, (font) => BOLD.test(font) && !BOLD_ITALIC.test(font)) : null;
  if (lead === null) return { text: line.text, lead, label };
  // A name's period is sometimes set in the regular face ("Lightning Absorption" + ".").
  const period = !lead.endsWith('.') && line.text.startsWith(`${lead}.`);
  return { text: line.text, lead: period ? `${lead}.` : lead, label };
}

/** The line's opening runs in the faces `face` takes, the spaces between them in any face. */
function opening(line: PdfLine, face: (font: string) => boolean): string | null {
  let text = '';
  for (const run of line.runs) {
    if (face(run.font)) text += run.text;
    else if (run.text.trim() === '' && text !== '') text += run.text;
    else break;
  }
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * A page's lines in reading order: a line that crosses the gutter cuts the page into bands, and
 * each band reads its left column top to bottom, then its right; pieces on one baseline of a
 * column join left to right.
 */
export function inReadingOrder(lines: readonly PdfLine[]): PdfLine[] {
  const wide = (line: PdfLine) => line.x0 < GUTTER - 12 && line.x1 > GUTTER + 12;
  const top = [...lines].sort((a, b) => b.y0 - a.y0 || a.x0 - b.x0);
  const ordered: PdfLine[] = [];
  let band: PdfLine[] = [];
  const flush = () => {
    ordered.push(...column(band.filter((line) => line.x0 < GUTTER)));
    ordered.push(...column(band.filter((line) => line.x0 >= GUTTER)));
    band = [];
  };
  for (const line of top) {
    if (wide(line)) {
      flush();
      ordered.push(line);
    } else band.push(line);
  }
  flush();
  return ordered;
}

function column(lines: readonly PdfLine[]): PdfLine[] {
  const out: PdfLine[] = [];
  for (const line of lines) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.y0 - line.y0) < BASELINE) {
      const [left, right] = last.x0 <= line.x0 ? [last, line] : [line, last];
      out[out.length - 1] = {
        ...left,
        x1: Math.max(left.x1, right.x1),
        y1: Math.max(left.y1, right.y1),
        size: Math.max(left.size, right.size),
        runs: [...left.runs, { font: '', size: 0, text: ' ' }, ...right.runs],
        text: `${left.text} ${right.text}`,
      };
    } else out.push(line);
  }
  return out;
}

/**
 * Lines joined into running text: a word split by a line-end hyphen joins again ("Dex-" +
 * "terity"); a hyphen after a digit stays ("30-" + "foot").
 */
export function joinLines(lines: readonly string[]): string {
  let text = '';
  for (const line of lines) {
    if (text === '') text = line;
    // A number's compound keeps its hyphens ("40-foot-" + "high").
    else if (/\d-[a-z]+-$/.test(text)) text += line;
    else if (/[A-Za-z]-$/.test(text) && /^[a-z]/.test(line)) text = text.slice(0, -1) + line;
    else if (/-$/.test(text)) text += line;
    else text += ` ${line}`;
  }
  return SPLIT_WORDS.reduce((joined, [split, word]) => joined.replaceAll(split, word), text);
}

/** Words the PDF breaks across a line with no hyphen to see (Rope Trick's). */
const SPLIT_WORDS: readonly (readonly [string, string])[] = [
  ['extra dimensional', 'extradimensional'],
];

/** A name set in small capitals reads back in mixed case ("Acid SplASh"): put it right. */
export function properName(raw: string): string {
  const small = new Set([
    'of',
    'the',
    'and',
    'to',
    'from',
    'with',
    'in',
    'on',
    'a',
    'an',
    'for',
    'at',
    'by',
    'or',
  ]);
  return raw
    .split(/\s+/)
    .map((word, index) =>
      word
        .split('-')
        .map((part) => {
          const lower = part.toLowerCase();
          if (index > 0 && small.has(lower)) return lower;
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join('-'),
    )
    .join(' ')
    .replace(/’S\b/g, '’s')
    .replace(/'S\b/g, "'s");
}

/** A stable ASCII slug: "Hunter's Mark" → "hunters-mark". */
export const slugOf = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
