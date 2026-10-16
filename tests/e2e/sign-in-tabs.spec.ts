import { expect, test, type Page } from '@playwright/test';

import { LIVE_URL } from './support/live.ts';
import { dockButton } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
  accessState,
  invite,
  joinAsDm,
  openInvitation,
} from './support/sign-in.ts';

/**
 * A tab whose browser's sign-in changed in another tab (docs/STAGE_340_DESIGN.md "Part B review
 * fixes"): the session cookie is the browser's, not the tab's. When one tab replaces the DM's
 * sign-in with a player's invitation, every other tab still showing the DM's world asks the server
 * again — when it is shown again, at its next refused request, when the browser comes back online
 * — and drops to "You are signed out": it never keeps the DM's view, nor sends the DM's actions
 * under the player's sign-in. The live stream would tell those tabs at its next cycle (its own
 * journeys); it is held down here, so only these checks can. Tokens are never printed.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const words = WORDS.en;
const mira = (page: Page) => page.getByRole('button', { name: 'Mira Vale', exact: true });

async function dmTab(page: Page): Promise<void> {
  await page.goto('/');
  await expect(dockButton(page, words.players)).toBeVisible();
}

test('tabs still showing the DM’s world are signed out once another tab replaced the sign-in', async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.route(LIVE_URL, (route) => route.abort());
  const shown = await context.newPage();
  await joinAsDm(shown, SIGN_IN_CAMPAIGNS.tabs);
  const link = await invite(shown, 'Elowen Starwhisper');
  const refused = await context.newPage();
  await dmTab(refused);
  const offline = await context.newPage();
  await dmTab(offline);
  // Quiet: every tab's reads are done (each read is followed by one more 1.5 s later).
  await shown.waitForTimeout(3_000);

  // Another tab opens the player's link and, asked, replaces the DM's sign-in.
  const player = await context.newPage();
  await openInvitation(player, link);
  const question = accessState(player, words.replaceQuestion);
  await expect(question).toContainText('You are signed in to “The Missing Caravan” as the DM.');
  await player.keyboard.press('Tab');
  const replace = question.getByRole('button', { name: words.replace });
  await expect(replace).toBeFocused();
  await expect(replace).toBeEnabled();
  await player.keyboard.press('Enter');
  await expect(mira(player)).toBeVisible();
  await expect(dockButton(player, words.players)).toHaveCount(0);

  // The DM's tabs still show the DM's world, each until it next asks the server.
  for (const page of [shown, refused, offline]) {
    await expect(dockButton(page, words.players)).toBeVisible();
  }
  // Shown again.
  await shown.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(accessState(shown, words.signedOut)).toBeVisible();
  // A refused request: the player may not read the DM's view.
  await refused.getByRole('button', { name: 'Refresh world', exact: true }).click();
  await expect(accessState(refused, words.signedOut)).toBeVisible();
  // Back online.
  await expect(dockButton(offline, words.players)).toBeVisible();
  await context.setOffline(true);
  await context.setOffline(false);
  await expect(accessState(offline, words.signedOut)).toBeVisible();

  for (const page of [shown, refused, offline]) {
    await expect(dockButton(page, words.players)).toHaveCount(0);
    await expect(mira(page)).toHaveCount(0);
  }
  // The player's tab asked too, and keeps the player's world.
  await expect(mira(player)).toBeVisible();
  await expect(accessState(player, words.signedOut)).toHaveCount(0);
  await context.close();
});
