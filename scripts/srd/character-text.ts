import { joinLines, type PdfLine } from './text.ts';

/**
 * How the SRD's character chapters (pages 28–88; docs/adr/0056-characters-from-the-srd.md §1) are
 * set: bold headings and labels, words joined at a line-end hyphen, and the leading 3 pt closer
 * than the 12 pt of running text that ends an entry's opening lines or a subclass's tagline.
 */
export const near = (a: number, b: number, by = 0.2) => Math.abs(a - b) < by;
export const bold = (line: PdfLine) => line.runs.some((run) => /SemiBold|Bold/.test(run.font));
export const joined = (a: string, b: string) => joinLines([a, b].filter((one) => one !== ''));

/** The space down to the next line of the same column, in points; null past a column or a page. */
const drop = (line: PdfLine | undefined, next: PdfLine | undefined): number | null =>
  line && next && next.page === line.page && Math.abs(next.x0 - line.x0) < 20
    ? line.y0 - next.y0
    : null;
export const closer = (line: PdfLine | undefined, next: PdfLine | undefined) =>
  (drop(line, next) ?? 12) < 11;

/**
 * The lines that open an entry before its words — "Prerequisite: …", a feat's category, a
 * species' "Speed: …" — each running on to the next such line, or to its words set closer below.
 */
export function openingLines(
  rows: readonly PdfLine[],
  opens: RegExp,
): { lines: string[]; rest: PdfLine[] } {
  const lines: string[] = [];
  let at = 0;
  while (at < rows.length && opens.test(rows[at]?.text ?? '')) {
    let words = rows[at]?.text ?? '';
    while (
      at + 1 < rows.length &&
      !closer(rows[at], rows[at + 1]) &&
      !opens.test(rows[at + 1]?.text ?? '')
    ) {
      at += 1;
      words = joined(words, rows[at]?.text ?? '');
    }
    lines.push(words);
    at += 1;
  }
  return { lines, rest: rows.slice(at) };
}
