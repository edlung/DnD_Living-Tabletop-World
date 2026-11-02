import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  inReadingOrder,
  joinLines,
  pageRows,
  properName,
  slugOf,
  srdLine,
  type PdfLine,
  type PdfRun,
} from './text.ts';

/** The SRD's lines as the import reads them (docs/adr/0051-srd-data.md §1). */
const run = (font: string, text: string): PdfRun => ({ font, size: 9.5, text });
const lineOf = (x0: number, y0: number, text: string, x1 = x0 + 200): PdfLine => ({
  page: 1,
  x0,
  y0,
  x1,
  y1: y0 + 9.5,
  size: 9.5,
  runs: [run('Optima-Regular', text)],
  text,
});

describe('reading order', () => {
  it('reads the left column, then the right; a line across the gutter starts a new band', () => {
    const lines = [
      lineOf(313, 700, 'right top'),
      lineOf(63, 600, 'left low'),
      lineOf(63, 700, 'left top'),
      lineOf(313, 600, 'right low'),
      lineOf(63, 500, 'across the page', 540),
      lineOf(313, 400, 'right after'),
      lineOf(63, 400.6, 'left after'),
    ];
    expect(inReadingOrder(lines).map((line) => line.text)).toEqual([
      'left top',
      'left low',
      'right top',
      'right low',
      'across the page',
      'left after',
      'right after',
    ]);
  });

  it('joins the pieces of one baseline in a column', () => {
    const pieces = [lineOf(120, 700.4, 'world', 160), lineOf(63, 700, 'hello', 110)];
    expect(inReadingOrder(pieces).map((line) => line.text)).toEqual(['hello world']);
  });

  it('puts a line whose font reports a box five times its size back on its line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'srd-lines-'));
    try {
      const rows = [
        // A heading in a well-behaved font, then body text whose box reaches 31 pt below it.
        {
          x0: 63,
          y0: 647.2,
          x1: 161,
          y1: 658.5,
          runs: [run('GillSans', 'Duration: Instantaneous')],
        },
        {
          x0: 63,
          y0: 498.6,
          x1: 161,
          y1: 554.4,
          runs: [run('Helvetica', 'spell slot level above 2.')],
        },
        { x0: 63, y0: 500.9, x1: 124, y1: 515.2, runs: [run('Helvetica', 'Acid Splash')] },
        {
          x0: 18,
          y0: 24.8,
          x1: 222,
          y1: 38,
          runs: [run('GillSans', '302 System Reference Document 5.2.1')],
        },
      ].map((row) =>
        JSON.stringify({ ...row, runs: row.runs.map((one) => ({ ...one, size: 10 })) }),
      );
      writeFileSync(join(dir, 'page-001.jsonl'), `${rows.join('\n')}\n`);
      expect(pageRows(dir, 1, 1).map((line) => line.text)).toEqual([
        'Duration: Instantaneous',
        'spell slot level above 2.',
        'Acid Splash',
      ]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe('a line’s opening', () => {
  it('is an entry’s name in bold italic, its pieces and a period in the regular face joined', () => {
    const gaze = srdLine({
      ...lineOf(63, 700, 'Petrifying Gaze (Recharge 5–6). Constitution Saving'),
      runs: [
        run('Optima-BoldItalic', 'Petrifying Gaze (Recharge'),
        run('Optima-Regular', ' '),
        run('Optima-BoldItalic', '5–6).'),
        run('Optima-Regular', ' '),
        run('Optima-Italic', 'Constitution Saving'),
      ],
    });
    expect(gaze.lead).toBe('Petrifying Gaze (Recharge 5–6).');
    const absorption = srdLine({
      ...lineOf(63, 700, 'Lightning Absorption. Whenever the golem'),
      runs: [
        run('Optima-BoldItalic', 'Lightning Absorption'),
        run('Optima-Regular', '. Whenever the golem'),
      ],
    });
    expect(absorption.lead).toBe('Lightning Absorption.');
  });

  it('is a label in bold upright', () => {
    const list = srdLine({
      ...lineOf(63, 700, 'At Will: Detect Magic'),
      runs: [run('Optima-Bold', 'At Will:'), run('Optima-Regular', ' Detect Magic')],
    });
    expect(list).toEqual({ text: 'At Will: Detect Magic', lead: null, label: 'At Will:' });
  });
});

describe('running text', () => {
  it('joins a word a line-end hyphen split, keeps a number’s hyphen, and mends a lost one', () => {
    expect(joinLines(['a Dex-', 'terity save'])).toBe('a Dexterity save');
    expect(joinLines(['a 30-', 'foot Cone'])).toBe('a 30-foot Cone');
    expect(joinLines(['Half', 'damage.'])).toBe('Half damage.');
    expect(joinLines(['an extra', 'dimensional space'])).toBe('an extradimensional space');
  });

  it('names read from small capitals, and their slugs', () => {
    expect(properName('Acid SplASh')).toBe('Acid Splash');
    expect(properName('FIND THE PATH')).toBe('Find the Path');
    expect(properName('HUNTER’S MARK')).toBe('Hunter’s Mark');
    expect(slugOf('Hunter’s Mark')).toBe('hunters-mark');
    expect(slugOf('Antipathy/Sympathy')).toBe('antipathy-sympathy');
  });
});
