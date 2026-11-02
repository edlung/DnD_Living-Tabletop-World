import { expect as baseExpect, test } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * The players' own dice and a roll between the DM and one player (docs/adr/0044-online-play.md
 * §4): the DM lets the table use real dice; a check asked in private is answered off the player's
 * d20, seen by the two of them only and confirmed by the DM; a free roll takes only faces on its
 * dice, and the server adds them up.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.ownDice;

test('a player answers a private check with their own d20 and the DM confirms it', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await enterWorld(player, TOKENS.player, CAMPAIGN);

  // The app's dice until the DM says otherwise.
  await openSheet(player, 'Dice');
  const playerDice = player.locator('#sheet-dice');
  await expect(playerDice.getByText('I roll my own dice')).toHaveCount(0);
  await openSheet(dm, 'Session');
  await dm
    .locator('#sheet-session')
    .getByRole('checkbox', { name: 'Players roll their own dice and enter what they show' })
    .check();
  await expect(playerDice.getByText('I roll my own dice').first()).toBeVisible();

  // A check asked in private.
  await openSheet(dm, 'Dice');
  const dmDice = dm.locator('#sheet-dice');
  const ask = dmDice.getByRole('region', { name: 'Ask for a check' });
  await ask.getByLabel('Character', { exact: true }).selectOption({ label: 'Elowen Starwhisper' });
  await ask.getByLabel('Check', { exact: true }).selectOption({ label: 'Dexterity saving throw' });
  await ask.getByRole('checkbox', { name: 'In private: only that player sees the roll' }).check();
  await ask.getByRole('button', { name: 'Ask', exact: true }).click();

  // The player answers off their own d20.
  const banner = player.locator('.asked-check');
  await expect(banner).toContainText('Dexterity saving throw');
  await expect(banner).toContainText('in private');
  await banner.getByRole('button', { name: 'My own dice', exact: true }).click();
  const face = banner.getByLabel('Die 1: d20', { exact: true });
  await face.fill('21');
  await expect(face).toHaveAttribute('aria-invalid', 'true');
  await expect(banner.getByRole('button', { name: 'Enter the roll' })).toBeDisabled();
  await face.fill('15');
  await expectAccessible(player, 'a check answered off one’s own dice');
  await banner.getByRole('button', { name: 'Enter the roll' }).click();
  await expect(banner).toHaveCount(0);
  const playerLog = playerDice.getByRole('region', { name: 'Recent rolls' });
  await expect(playerLog).toContainText('own dice');
  await expect(playerLog).toContainText('only you and the DM');

  // The DM sees it, marked, and confirms it; the player sees the DM's word.
  const dmLog = dmDice.getByRole('region', { name: 'Recent rolls' });
  await expect(dmLog).toContainText('only you and this player');
  await dmLog.getByRole('button', { name: 'Confirm: the dice showed this' }).click();
  await expect(dmLog).toContainText('own dice, confirmed by the DM');
  await expect(playerLog).toContainText('own dice, confirmed by the DM');

  // A free roll takes only faces on its dice; the server adds them up.
  const builder = playerDice.getByRole('region', { name: 'Roll dice' });
  await builder.getByRole('button', { name: 'Add a d6' }).click();
  await builder.getByRole('button', { name: 'Add a d6' }).click();
  await builder.getByRole('checkbox', { name: 'I roll my own dice' }).check();
  await builder.getByLabel('Die 1: d6', { exact: true }).fill('3');
  await builder.getByLabel('Die 2: d6', { exact: true }).fill('9');
  await expect(builder.getByRole('button', { name: 'Enter the roll' })).toBeDisabled();
  await builder.getByLabel('Die 2: d6', { exact: true }).fill('4');
  await builder.getByRole('button', { name: 'Enter the roll' }).click();
  await expect(playerLog.getByRole('listitem').first()).toContainText('7');
  await expect(playerLog.getByRole('listitem').first()).toContainText('own dice');
});
