import { describe, expect, it } from 'vitest';

import { freshReading, readBlocks, textBlock } from './reference-blocks.ts';
import type { PdfLine } from './text.ts';

/**
 * The rules text into blocks (docs/adr/0055-rules-reference-and-toolbox.md §1), on lines set as
 * the SRD sets them: 10 pt text in the left column (its edge at 63 pt), 12 pt apart.
 */
const line = (text: string, x0: number, y0: number, font = 'Helvetica'): PdfLine => ({
  page: 1,
  x0,
  y0,
  x1: x0 + 200,
  y1: y0 + 10,
  size: 10,
  runs: [{ font, size: 10, text }],
  text,
});
const read = (lines: readonly PdfLine[]) => readBlocks('unused', lines, freshReading());

describe('the rules text into blocks', () => {
  it('keeps a run-in head apart, and only a short capitalized one', () => {
    expect(textBlock('paragraph', 'Detect and Disarm. As a Search action, a creature …')).toEqual({
      kind: 'paragraph',
      head: 'Detect and Disarm',
      text: 'As a Search action, a creature …',
    });
    expect(textBlock('paragraph', 'Trigger: A creature crosses a trip wire').head).toBe('Trigger:');
    expect(textBlock('paragraph', 'Attack rolls against the creature have Advantage.').head).toBe(
      null,
    );
  });

  it('opens a plain paragraph on a line set in, a hanging one at the edge', () => {
    const blocks = read([
      line('Cheaply made potions are sometimes tainted by', 63, 700),
      line('Cackle Fever.', 63, 688),
      line('Fever. The creature gains 1 Exhaustion level,', 63, 670.6),
      line('which lasts until the contagion ends.', 71, 658.6),
      line('Laughter. While the creature has the', 63, 646.6),
      line('Exhaustion condition, it laughs.', 71, 634.6),
      line('Fighting the Contagion. At the end of each', 71, 617.2),
      line('Long Rest, it makes a DC 13 save.', 63, 605.2),
    ]);
    expect(blocks.map((block) => (block.kind === 'paragraph' ? block.head : block.kind))).toEqual([
      null,
      'Fever',
      'Laughter',
      'Fighting the Contagion',
    ]);
    expect(blocks[1]).toMatchObject({
      text: 'The creature gains 1 Exhaustion level, which lasts until the contagion ends.',
    });
    expect(blocks[3]).toMatchObject({
      text: 'At the end of each Long Rest, it makes a DC 13 save.',
    });
  });

  it('puts a bullet set under its item on the item’s first line', () => {
    const blocks = read([
      line('build either of these encounters:', 63, 700),
      line('2 Druids (450 XP each) and 9 Stirges (25 XP', 71, 681.7),
      line('•', 63, 675),
      line('each), for 1,125 XP total', 71, 668.7),
      line('1 Wight (700 XP), 1 Warhorse Skeleton,', 71, 655.7),
      line('•', 63, 649),
    ]);
    expect(blocks).toEqual([
      { kind: 'paragraph', head: null, text: 'build either of these encounters:' },
      {
        kind: 'item',
        head: null,
        text: '2 Druids (450 XP each) and 9 Stirges (25 XP each), for 1,125 XP total',
      },
      { kind: 'item', head: null, text: '1 Wight (700 XP), 1 Warhorse Skeleton,' },
    ]);
  });

  it('reads a line of names in the sans face as a list, in order', () => {
    const names = { ...line('Dash Attack', 63, 650, 'GillSans') };
    const split: PdfLine = {
      ...names,
      runs: [
        { font: 'GillSans', size: 10, text: 'Dash' },
        { font: '', size: 0, text: ' ' },
        { font: 'GillSans', size: 10, text: 'Attack' },
      ],
    };
    expect(read([line('These actions are defined elsewhere:', 63, 662), split])[1]).toEqual({
      kind: 'names',
      names: ['Attack', 'Dash'],
    });
  });
});
