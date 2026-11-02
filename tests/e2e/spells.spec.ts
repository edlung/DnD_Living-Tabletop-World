import { expect as baseExpect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import {
  COMBAT_CAMPAIGNS,
  clickWhereShown,
  enterCombat,
  expectAccepted,
  square,
  submit,
  turnTray,
} from './support/combat.ts';
import { openCharacter } from './support/shell.ts';

/**
 * SRD spells at the table (docs/adr/0052-spells-as-data.md): Elowen also studies as a wizard. At
 * Raider 1 (8, 4) the tray offers her Fire Bolt, Magic Missile and Shatter; Magic Missile asks
 * which slot, saying a higher one adds a dart; Fire Bolt is cast and its outcome told; her spells
 * show the SRD's words and what the DM applies.
 */
const expect = baseExpect.configure({ timeout: 15_000 });

test('a wizard’s spells in the tray: a slot asked, a cantrip cast, the SRD’s words', async ({
  page,
}) => {
  const campaign = COMBAT_CAMPAIGNS.spells;
  await enterCombat(page, campaign);
  await clickWhereShown(page, square(page, 8, 4));
  const tray = turnTray(page);
  const missile = tray.getByRole('button', { name: /^Cast Magic Missile at / });
  await expect(missile).toBeEnabled();
  await expect(tray.getByRole('button', { name: /^Cast Shatter at .*’s square$/ })).toBeVisible();
  await expect(tray).toContainText('the DM applies the rest');

  // Magic Missile asks which slot; a higher one adds a dart.
  await missile.click();
  const asked = tray.getByRole('group', { name: 'Magic Missile: which slot?' });
  await expect(asked).toContainText('Each level above 1 adds 1 more.');
  await expect(asked.getByRole('button', { name: 'Level 1 slot' })).toBeVisible();
  await expect(asked.getByRole('button', { name: 'Level 2 slot' })).toBeVisible();
  await expectAccessible(page, 'the slot question');
  await asked.getByRole('button', { name: 'Cancel' }).click();
  await expect(asked).toHaveCount(0);

  // Fire Bolt: a cantrip, no slot; the server rolls and tells.
  expectAccepted(await submit(page, tray.getByRole('button', { name: /^Cast Fire Bolt at / })));
  await expect(page.getByText(/Fire Bolt resolved on 1 target/)).toBeVisible();

  // Her spells: the SRD's words, and what is the DM's.
  const spells = await openCharacter(page, 'Spells');
  const shatter = spells.locator('.spell-card').filter({ hasText: 'Shatter' });
  await expect(shatter).toContainText('A loud noise erupts from a point of your choice');
  await expect(shatter).toContainText('The server rolls its dice; the DM applies the rest.');
  await expect(spells.locator('.spell-card').filter({ hasText: 'Fire Bolt' })).not.toContainText(
    'the DM applies',
  );
});
