import { expect as baseExpect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import {
  COMBAT_CAMPAIGNS,
  battlefield,
  enterCombat,
  expectAccepted,
  square,
  submit,
} from './support/combat.ts';
import { TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * The light of a running fight (docs/adr/0050-the-world-around.md §1): the DM puts it out from
 * the encounter controls; the player's board darkens, each square says so, the legend names it.
 */
const expect = baseExpect.configure({ timeout: 15_000 });

test('the DM puts out the light, and the player’s board goes dark', async ({ browser }) => {
  const campaign = COMBAT_CAMPAIGNS.light;
  const dm = await browser.newPage();
  await enterCombat(dm, campaign, TOKENS.dm);
  await openSheet(dm, 'Encounter');
  const light = dm.getByRole('group', { name: 'Light of the fight' });
  await expect(light.getByRole('button', { name: 'Bright' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expectAccepted(await submit(dm, light.getByRole('button', { name: 'Darkness' })));
  await expect(light.getByRole('button', { name: 'Darkness' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const player = await browser.newPage();
  await enterCombat(player, campaign);
  await expect(square(player, 2, 6)).toHaveAccessibleName(/darkness/);
  await expect(battlefield(player).locator('.square-shade--dark').first()).toBeVisible();
  const legend = battlefield(player).getByRole('region', { name: 'Reading the board' });
  await expect(legend.getByText('Darkness', { exact: true })).toBeVisible();
  await expectAccessible(player, 'the board in darkness');
});
