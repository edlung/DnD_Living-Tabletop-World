import { expect as baseExpect, test } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { dockButton, expectOnTop, openSheet } from './support/shell.ts';

/**
 * The player's companion (docs/adr/0044-online-play.md §3): a check the DM asks buzzes the phone,
 * stays over the stage with its Roll, marks Dice and counts in the tab's title until it is
 * answered, and comes back after a reload; the DM's Party sheet shows whom the table waits for.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.companion;

test('the table waits for a player until the check asked of them is rolled', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const dm = await (await browser.newContext()).newPage();
  const playerContext = await browser.newContext();
  // A buzz is counted where the test can read it.
  await playerContext.addInitScript(() => {
    const counted = window as unknown as { buzzes: number };
    counted.buzzes = 0;
    navigator.vibrate = () => {
      counted.buzzes += 1;
      return true;
    };
  });
  const player = await playerContext.newPage();
  const buzzes = () => player.evaluate(() => (window as unknown as { buzzes: number }).buzzes);
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await enterWorld(player, TOKENS.player, CAMPAIGN);
  await expect(player.getByRole('region', { name: 'Scene', exact: true })).toBeVisible();

  await openSheet(dm, 'Party');
  const party = dm.locator('#sheet-party');
  const ask = party.getByRole('region', { name: 'Ask for a check' });
  await ask.getByLabel('Character', { exact: true }).selectOption({ label: 'Elowen Starwhisper' });
  await ask.getByLabel('Check', { exact: true }).selectOption({ label: 'Dexterity saving throw' });
  await ask.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(party.locator('.party-waiting')).toContainText('Dexterity saving throw');

  const banner = player.locator('.asked-check');
  await expect(banner).toContainText('The DM asks: Dexterity saving throw');
  await expect(dockButton(player, 'Dice')).toHaveClass(/has-waiting/);
  await expect.poll(() => player.title()).toMatch(/^\(1\) /);
  await expect.poll(buzzes).toBe(1);
  await expectAccessible(player, 'a check asked over the stage');

  // A reload comes back to the open question; what waited at first sight does not buzz again.
  await player.reload();
  await enterWorld(player, TOKENS.player, CAMPAIGN);
  await expect(banner).toContainText('The DM asks: Dexterity saving throw');
  expect(await buzzes()).toBe(0);

  // The table's questions share one column: a pause and the check both show, neither covered.
  await openSheet(dm, 'Session');
  const session = dm.locator('#sheet-session');
  await session.getByRole('button', { name: 'Pause the game', exact: true }).click();
  const paused = player.getByText('The DM paused the game. It waits until they resume.');
  await expect(paused).toBeVisible();
  await expectOnTop(paused);
  await expectOnTop(banner.getByRole('button', { name: 'Roll', exact: true }));
  await session.getByRole('button', { name: 'Resume the game', exact: true }).click();
  await expect(paused).toBeHidden();

  // Rolling answers it: the question, the marker, the count and the DM's waiting go.
  await banner.getByRole('button', { name: 'Roll', exact: true }).click();
  await expect(banner).toHaveCount(0);
  await expect(dockButton(player, 'Dice')).not.toHaveClass(/has-waiting/);
  await expect.poll(() => player.title()).not.toMatch(/^\(\d+\) /);
  await expect(party.locator('.party-waiting')).toHaveCount(0);
});
