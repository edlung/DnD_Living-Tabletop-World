import type { Locator, Page } from '@playwright/test';

/**
 * A drawn choice (docs/adr/0075-book-interface.md §25): where a form offers a few named things —
 * the weather, who is surprised, whom a check is asked of — each is a tile, a radio button under
 * the group's legend. The tile by the legend and its word; `.check()` chooses it.
 */
export const tile = (scope: Page | Locator, legend: string | RegExp, word: string): Locator =>
  scope
    .getByRole(
      'group',
      typeof legend === 'string' ? { name: legend, exact: true } : { name: legend },
    )
    .getByRole('radio', { name: word, exact: true });
