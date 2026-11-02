import { expect as baseExpect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { openCharacter, openSheet } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  invite,
  joinAsDm,
  joinPath,
  openInvitation,
  tokenOf,
} from './support/sign-in.ts';

/**
 * One player, several characters (docs/adr/0044-online-play.md §6, plan decision 14): the DM gives
 * the player of Elowen Brann too; the player switches to him in the perspective control and acts
 * as him, each keeping its own knowledge; revoking the player frees both.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = SIGN_IN_CAMPAIGNS.characters;

test('the DM gives a player a second character, and the player switches to it', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const dm = await (await browser.newContext({ baseURL: SIGN_IN_ORIGIN })).newPage();
  await joinAsDm(dm, CAMPAIGN);
  const link = await invite(dm, 'Elowen Starwhisper');
  const player = await (await browser.newContext({ baseURL: SIGN_IN_ORIGIN })).newPage();
  await openInvitation(player, joinPath(tokenOf(link)));
  await expect(player.getByRole('region', { name: 'Scene', exact: true })).toBeVisible();

  await openSheet(dm, 'Players');
  const members = dm
    .locator('#sheet-players')
    .getByRole('region', { name: 'Players at the table' });
  await expect(members).toContainText('Elowen Starwhisper');
  await members
    .getByLabel('Another character for this player', { exact: true })
    .selectOption({ label: 'Brann Ironvale' });
  await expectAccessible(dm, 'giving a player another character');
  await members.getByRole('button', { name: 'Give: Elowen Starwhisper', exact: true }).click();
  await expect(dm.locator('#sheet-players')).toContainText(
    'The player of Elowen Starwhisper now also plays Brann Ironvale.',
  );
  await expect(members).toContainText('Also plays: Brann Ironvale');

  // The player's perspective control offers Brann; as Brann, the sheet is his.
  const perspective = player.getByLabel('Perspective', { exact: true });
  await expect(perspective.locator('option', { hasText: 'Brann Ironvale' })).toHaveCount(1);
  await perspective.selectOption({ label: 'Brann Ironvale' });
  const sheet = await openCharacter(player, 'Overview');
  await expect(player.getByRole('dialog')).toContainText('Brann Ironvale');
  await expect(sheet).toBeVisible();
});
