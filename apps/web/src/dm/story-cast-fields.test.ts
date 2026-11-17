import { describe, expect, it } from 'vitest';

import { fitted } from './story-cast-fields.tsx';

/**
 * A paragraph of the party's chapters offered to the story cast (docs/adr/0073-table-ideas.md §8)
 * is cut to the cast's size where a reader would stop — never in the middle of a word.
 */
describe('a paragraph fitted to the story cast', () => {
  it('is whole when it fits', () => {
    expect(fitted('  Night falls.  ', 40)).toBe('Night falls.');
  });

  it('ends at a sentence when one ends in its second half', () => {
    const text = 'The road was long. The gate was shut. Nobody answered the bell that evening.';
    expect(fitted(text, 45)).toBe('The road was long. The gate was shut.');
  });

  it('else ends at a word, and says that it goes on', () => {
    const text = 'A caravan of twelve carts crossed the moor without a single lantern lit';
    const cut = fitted(text, 30);
    expect(cut.length).toBeLessThanOrEqual(30);
    expect(cut.endsWith('…')).toBe(true);
    expect(text.startsWith(cut.slice(0, -1))).toBe(true);
    expect(cut.slice(0, -1).endsWith(' ')).toBe(false);
    expect(text[cut.length - 1]).toBe(' ');
  });

  it('never grows past the cast’s own limit', () => {
    expect(fitted('x'.repeat(2000)).length).toBeLessThanOrEqual(600);
  });
});
