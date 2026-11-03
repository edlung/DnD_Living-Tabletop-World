import { randomTableSchema, resultOn } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { parseTableLines, tableLines } from './table-lines.ts';

/**
 * A random table written as lines (docs/adr/0058-campaign-content.md §4): "Road encounters" on a
 * d6 — wolves on 1–2, a pedlar on 3, bandits on 4–6 — read back, changed and checked.
 */
describe('a random table written as lines', () => {
  it('reads each line’s range and words, in any dash', () => {
    const parsed = parseTableLines('1–2 Wolves\n3. A pedlar\n4-6: Bandits', 6);
    expect(parsed).toEqual({
      ok: true,
      results: [
        { from: 1, to: 2, text: 'Wolves' },
        { from: 3, to: 3, text: 'A pedlar' },
        { from: 4, to: 6, text: 'Bandits' },
      ],
    });
    if (!parsed.ok) return;
    const table = randomTableSchema.parse({ name: 'Road', die: 6, results: parsed.results });
    expect(resultOn(table, 5)?.text).toBe('Bandits');
    // Changed as it was written.
    expect(tableLines(parsed.results)).toBe('1–2 Wolves\n3 A pedlar\n4–6 Bandits');
  });

  it('shares the die evenly between lines with no numbers', () => {
    const parsed = parseTableLines('Wolves\nA pedlar\nBandits\nRain', 20);
    expect(parsed.ok && parsed.results.map((one) => [one.from, one.to])).toEqual([
      [1, 5],
      [6, 10],
      [11, 15],
      [16, 20],
    ]);
    expect(parseTableLines('Wolves\nA pedlar\nBandits', 20)).toEqual({
      ok: false,
      problem: { kind: 'uneven', count: 3 },
    });
  });

  it('reads "00" as the hundred of a d100', () => {
    const parsed = parseTableLines('01-99 Nothing\n00 The dragon', 100);
    expect(parsed.ok && parsed.results.at(-1)).toEqual({ from: 100, to: 100, text: 'The dragon' });
  });

  it('says what is wrong, and where', () => {
    expect(parseTableLines('  \n', 6)).toEqual({ ok: false, problem: { kind: 'empty' } });
    expect(parseTableLines('1-2 Wolves\nA pedlar', 6)).toEqual({
      ok: false,
      problem: { kind: 'no-range', line: 2 },
    });
    expect(parseTableLines('1-2 Wolves\n3-7 Bandits', 6)).toEqual({
      ok: false,
      problem: { kind: 'off-die', line: 2 },
    });
    // A skipped face, a repeated one, a table that stops short.
    for (const [lines, face] of [
      ['1-2 Wolves\n4-6 Bandits', 3],
      ['1-3 Wolves\n3-6 Bandits', 4],
      ['1-2 Wolves\n3-5 Bandits', 6],
    ] as const) {
      expect(parseTableLines(lines, 6)).toEqual({ ok: false, problem: { kind: 'gap', face } });
    }
    expect(parseTableLines(`1-6 ${'x'.repeat(301)}`, 6)).toEqual({
      ok: false,
      problem: { kind: 'too-long', line: 1 },
    });
  });
});
