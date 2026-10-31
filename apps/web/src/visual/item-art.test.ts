import { ITEM_CATALOG } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { RECIPES } from '../../../../scripts/ui-kit/recipes.ts';
import { itemArtUrl } from './ui-kit.ts';

/** Item catalog pictures (Stage 480): optional per entry, never a stand-in for another item. */
describe('item catalog art', () => {
  it('has no picture for an unknown ID, and a URL only where a file exists', () => {
    expect(itemArtUrl('no-such-item')).toBeNull();
    for (const entry of ITEM_CATALOG) {
      const url = itemArtUrl(entry.itemId);
      expect(url === null || /catalog\/items\/|\.webp/.test(url), entry.itemId).toBe(true);
    }
  });

  it('has one generation recipe per catalog entry, named for the original file', () => {
    for (const entry of ITEM_CATALOG)
      expect(RECIPES[`item-${entry.itemId}`], entry.itemId).toMatchObject({
        kind: 'art',
        out: `catalog/items/${entry.itemId}.webp`,
      });
  });
});
