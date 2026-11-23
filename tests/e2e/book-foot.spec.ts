import { expect as baseExpect } from '@playwright/test';

import { UI_DICE_CAMPAIGNS } from '../../apps/server/src/testing/ui-dice-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { test } from './support/journey.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { expectOnTop } from './support/shell.ts';

/**
 * The dice at the foot of every page (docs/adr/0075-book-interface.md §8): a player presses a die
 * and the table sees the roll — the DM in the foot of the DM's own book; "More dice" opens the Dice
 * page; on a phone the foot keeps three dice above the bookmarks, every one of them in reach.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const campaign = UI_DICE_CAMPAIGNS.foot;

test('a die pressed at the foot of the page is rolled for the table', async ({ browser }) => {
  const player = await (await browser.newContext()).newPage();
  const dm = await (await browser.newContext()).newPage();
  await enterWorld(player, TOKENS.player, campaign);
  await enterWorld(dm, TOKENS.dm, campaign);
  const foot = player.getByRole('group', { name: 'The dice at the foot of the page' });
  await expect(foot).toBeVisible();
  await expect(foot).toContainText('No dice yet');
  for (const sides of [4, 6, 8, 10, 12, 20, 100])
    await expectOnTop(foot.getByRole('button', { name: `Roll a d${String(sides)} for the table` }));
  await expectAccessible(player, 'the dice at the foot of the page');

  await foot.getByRole('button', { name: 'Roll a d20 for the table', exact: true }).click();
  // The roll is the server's: her name and its number stand at her foot and at the DM's.
  await expect(foot).toContainText('Elowen Starwhisper', { timeout: 20_000 });
  const number = (await foot.locator('.book-foot-last strong').textContent()) ?? '';
  expect(Number(number)).toBeGreaterThanOrEqual(1);
  expect(Number(number)).toBeLessThanOrEqual(20);
  const dmFoot = dm.getByRole('group', { name: 'The dice at the foot of the page' });
  await expect(dmFoot).toContainText('Elowen Starwhisper', { timeout: 20_000 });
  await expect(dmFoot.locator('.book-foot-last strong')).toHaveText(number);

  // More: the Dice page, with the roll in its log.
  await foot.getByRole('button', { name: 'More dice', exact: true }).click();
  await expect(player.locator('#sheet-dice')).toBeVisible();
  await expect(player.locator('#sheet-dice')).toContainText('Elowen Starwhisper');
});

test('on a phone the foot keeps three dice above the bookmarks', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterWorld(page, TOKENS.player, campaign);
  const foot = page.getByRole('group', { name: 'The dice at the foot of the page' });
  for (const sides of [6, 8, 20])
    await expectOnTop(foot.getByRole('button', { name: `Roll a d${String(sides)} for the table` }));
  await expect(foot.getByRole('button', { name: 'Roll a d100 for the table' })).toBeHidden();
  await expectOnTop(foot.getByRole('button', { name: 'More dice', exact: true }));
  const [footBox, parts] = await Promise.all([
    foot.boundingBox(),
    page.locator('nav.book-parts').boundingBox(),
  ]);
  expect((footBox?.y ?? 0) + (footBox?.height ?? 0)).toBeLessThanOrEqual(parts?.y ?? 0);
  await expectOnTop(page.getByRole('button', { name: 'What can I do?', exact: true }));
});
