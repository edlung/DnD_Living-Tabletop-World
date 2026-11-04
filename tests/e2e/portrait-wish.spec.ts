import { expect as baseExpect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { closeCharacter, openCharacter, openSheet } from './support/shell.ts';

/**
 * A player's wish for a portrait (docs/adr/0056-characters-from-the-srd.md §5): Elowen's player
 * describes her; the DM finds the wish on the Images sheet and makes the portrait with those words,
 * which asks the image model; the wish is answered, and the player's Overview no longer shows it.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const LOOK = 'Silver-grey hair, a weathered green cloak, a yew longbow across her back';

test('a player asks for a portrait and the DM makes it from the wish', async ({ browser }) => {
  test.setTimeout(120_000);
  const player = await (await browser.newContext()).newPage();
  await enterWorld(player, TOKENS.player, 'ui-portrait');
  const overview = await openCharacter(player, 'Overview');
  const wish = overview.getByRole('region', { name: 'A portrait' });
  await wish.getByLabel('How does Elowen Starwhisper look?').fill(LOOK);
  await expectAccessible(player, 'the wish for a portrait');
  await wish.getByRole('button', { name: 'Ask for a portrait' }).click();
  await expect(wish.getByRole('status')).toHaveText(
    `Asked for: «${LOOK}». The DM makes the picture.`,
  );

  const dm = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, 'ui-portrait');
  await openSheet(dm, 'Images');
  const wishes = dm.getByRole('region', { name: 'Portraits players asked for' });
  await expect(wishes).toContainText(LOOK);
  await wishes.getByRole('button', { name: 'Make the portrait of Elowen Starwhisper' }).click();
  await expect(wishes).toHaveCount(0);
  await expect(dm.locator('.images-work')).toContainText('Elowen Starwhisper');

  // Opened again, the sheet is read again: the wish is answered.
  await closeCharacter(player);
  const after = await openCharacter(player, 'Overview');
  await expect(after.getByRole('region', { name: 'A portrait' })).not.toContainText('Asked for');
});
