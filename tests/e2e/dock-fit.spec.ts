import { expect as baseExpect } from '@playwright/test';

import { test } from './support/journey.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { dockButton, expectDockFits } from './support/shell.ts';

/**
 * A player's dock fits every screen (docs/adr/0043-dm-screen.md §3): full words where they fit,
 * short words where they do not, the last items under More where those do not fit either. It never
 * scrolls sideways and nothing covers it. The DM's screen is the DM's book, whose parts fit every
 * screen too (`dm-book-parts.spec.ts`).
 */
const expect = baseExpect.configure({ timeout: 15_000 });

test('a player’s tab bar fits the narrowest phone', async ({ page }) => {
  await enterWorld(page, TOKENS.player);
  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 740 });
    await expectDockFits(page);
    for (const name of ['Scene', 'Places', 'Journal', 'Character', 'Dice', 'Chat', 'Chronicle']) {
      await expect(dockButton(page, name)).toBeAttached();
    }
  }
});
