import { itemEntry } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { entryIn, srdTextOf } from './srd-words.ts';

/**
 * An SRD item in a Russian campaign (docs/adr/0055-rules-reference-and-toolbox.md §5): its Russian
 * name, line and words once they exist; an English campaign, and Ravenford's own, unchanged.
 */
const entry = (itemId: string) => {
  const found = itemEntry(itemId);
  if (!found) throw new Error(`no ${itemId}`);
  return found;
};

describe('an SRD item in Russian', () => {
  it('names a Longsword, its line and its words in Russian', () => {
    const shown = entryIn(entry('srd-longsword'), 'ru');
    expect(shown.name).toEqual({ en: 'Longsword', ru: 'Длинный меч' });
    expect(shown.description.ru).toBe('Воинское рукопашное оружие: 1d8 рубящий урон.');
    expect(shown.untranslated).toBeUndefined();
    expect(srdTextOf('srd-rope', 'ru')).toMatch(/верёвк/i);
  });

  it('names a +1 made of one of three by the Russian before its list', () => {
    expect(entryIn(entry('srd-weapon-plus-1'), 'ru').name.ru).toBe('Оружие, +1');
  });

  it('leaves an English campaign and Ravenford’s own as they are', () => {
    const longsword = entry('srd-longsword');
    expect(entryIn(longsword, 'en')).toBe(longsword);
    const cloak = entry('caravan-cloak');
    expect(entryIn(cloak, 'ru')).toBe(cloak);
  });
});
