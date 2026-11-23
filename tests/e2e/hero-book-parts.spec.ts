import { expect as baseExpect } from '@playwright/test';

import { test } from './support/journey.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { bookPart, dockButton, expectDockFits, openCharacter, openSheet } from './support/shell.ts';

/**
 * A hero's book (docs/adr/0075-book-interface.md §4): five parts at the fore-edge — on a phone
 * along the bottom — and the open part's pages as tabs. Every section a player's dock held is a
 * page of one part; the Hero's bookmark opens the hero's sheet; it fits the narrowest phone.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const PARTS = ['Scene', 'Hero', 'World', 'Journal', 'At the table'];
const PAGES = ['Scene', 'Character', 'Places', 'Journal', 'Chronicle', 'Dice', 'Chat', 'Rules'];

test('a player’s book fits every phone and every page opens through its part', async ({ page }) => {
  test.setTimeout(90_000);
  await enterWorld(page, TOKENS.player);
  await expect(page.locator('nav.dock')).toHaveCount(0);
  for (const width of [1180, 768, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 740 });
    await expectDockFits(page);
    for (const name of PARTS) await expect(bookPart(page, name)).toBeVisible();
    for (const name of PAGES) await expect(dockButton(page, name)).toBeAttached();
  }
  await openSheet(page, 'Dice');
  await expect(bookPart(page, 'At the table')).toHaveAttribute('aria-current', 'page');
  await openSheet(page, 'Journal');
  await expect(bookPart(page, 'Journal')).toHaveAttribute('aria-current', 'page');
  // The Hero's bookmark opens the hero's sheet on the book's paper.
  const overview = await openCharacter(page, 'Overview');
  await expect(overview).toBeVisible();
  await expect(page.locator('dialog.hero-dialog')).toHaveAttribute('data-surface', 'paper');
});
