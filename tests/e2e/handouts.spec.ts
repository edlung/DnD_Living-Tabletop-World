import { expect as baseExpect, test } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { dockButton, openSheet } from './support/shell.ts';

/**
 * Handouts (docs/adr/0044-online-play.md §5): the DM gives a player a letter from the Party sheet;
 * it waits over the player's stage and marks the Journal until it is read there. A picture of
 * something the player does not know is refused.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.handouts;

test('the DM gives a player a letter, and the player reads it in the Journal', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await enterWorld(player, TOKENS.player, CAMPAIGN);
  await expect(player.getByRole('region', { name: 'Scene', exact: true })).toBeVisible();

  await openSheet(dm, 'Party');
  const give = dm.locator('#sheet-party').getByRole('region', { name: 'Give a handout' });
  await give.getByLabel('For', { exact: true }).selectOption({ label: 'Elowen Starwhisper' });
  // A picture of a place she has never found: refused.
  await give.getByLabel('Title', { exact: true }).fill('A map');
  await give
    .getByLabel('Picture (optional)', { exact: true })
    .selectOption({ label: 'Abandoned Caravan Site' });
  await give.getByRole('button', { name: 'Give the handout' }).click();
  await expect(give).toContainText('the picture must be of something its reader knows');
  // A letter in words.
  await give
    .getByLabel('Picture (optional)', { exact: true })
    .selectOption({ label: 'No picture' });
  await give.getByLabel('Title', { exact: true }).fill('A letter, unsigned');
  await give
    .getByLabel('Text (optional)', { exact: true })
    .fill('Meet me at the old mill at dusk.');
  await expectAccessible(dm, 'the Give a handout form');
  await give.getByRole('button', { name: 'Give the handout' }).click();
  await expect(give).toContainText('Given.');

  const banner = player.locator('.asked-check', { hasText: 'A letter, unsigned' });
  await expect(banner).toContainText('The DM gave you a handout: A letter, unsigned');
  await expect(dockButton(player, 'Journal')).toHaveClass(/has-waiting/);
  await expect.poll(() => player.title()).toMatch(/^\(1\) /);
  await banner.getByRole('button', { name: 'Read', exact: true }).click();
  const journal = player.locator('#sheet-journal');
  await expect(journal).toBeVisible();
  const letter = journal.getByRole('article', { name: 'A letter, unsigned' });
  await expect(letter).toContainText('Meet me at the old mill at dusk.');
  await expect(letter).toContainText('For Elowen Starwhisper');
  await expect(letter).toBeFocused();
  await expect(banner).toHaveCount(0);
  await expect(dockButton(player, 'Journal')).not.toHaveClass(/has-waiting/);
  await expectAccessible(player, 'a handout in the Journal');

  // The DM's Journal lists every handout given.
  await openSheet(dm, 'Journal');
  await expect(dm.locator('#sheet-journal')).toContainText('A letter, unsigned');
});
