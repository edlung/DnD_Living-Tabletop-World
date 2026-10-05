import { describe, expect, it } from 'vitest';

import { tokens } from './retrieval.ts';

describe('lexical recall of Russian word forms (ADR 0031 §7)', () => {
  it('reduces the cases of one noun to one stem', () => {
    for (const form of ['каравана', 'караване', 'каравану', 'караваном', 'караванов']) {
      expect([...tokens(form)], form).toEqual([...tokens('караван')]);
    }
  });

  it('does not cut short words or join different words', () => {
    expect([...tokens('дом дым')]).toEqual(['дом', 'дым']);
    expect(tokens('дорога').has('дорог')).toBe(true);
    expect(tokens('дорога').has('торговая')).toBe(false);
  });

  it('leaves English and mixed-script tokens exactly as before', () => {
    expect([...tokens('The caravans left Ravenford')]).toEqual([
      'the',
      'caravans',
      'left',
      'ravenford',
    ]);
    expect([...tokens('NBXTRUTH Орин')]).toEqual(['nbxtruth', 'орин']);
  });
});
