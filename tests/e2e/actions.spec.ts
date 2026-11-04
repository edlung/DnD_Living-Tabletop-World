import { expect as baseExpect, test } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import {
  battlefield,
  clickWhereShown,
  submit,
  turnTray,
  expectAccepted,
} from './support/combat.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * The actions beside Attack and Magic (docs/adr/0045-conditions-and-actions.md §5) from the
 * player's turn tray: on herself, Elowen's own actions; Search asks its skill first and rolls it
 * for the table's log; the action spent, the rest wait for the next turn.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.actions;

test('a player takes the Search action from the tray, picking its skill', async ({ browser }) => {
  test.setTimeout(150_000);
  const wide = { viewport: { width: 1440, height: 900 } };
  const dm = await (await browser.newContext(wide)).newPage();
  const player = await (await browser.newContext(wide)).newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await enterWorld(player, TOKENS.player, CAMPAIGN);
  await openSheet(dm, 'Encounter');
  const sheet = dm.locator('#sheet-encounter');
  await sheet
    .getByRole('button', { name: 'Start: Ambush on the Old Trade Road', exact: true })
    .click();
  const rows = sheet.getByRole('region', { name: 'Turn order' }).locator('ol.turn-order > li');
  await expect(rows.first()).toBeVisible();
  // Whoever acts first waits until after Elowen: her turn now.
  const now = rows.filter({ hasText: 'Now' });
  await now.getByRole('button', { name: 'Delay the turn', exact: true }).click();
  await now
    .getByLabel(/acts after$/)
    .selectOption({ label: 'Elowen Starwhisper' })
    .catch(() => undefined);
  await now.getByRole('button', { name: 'Delay the turn', exact: true }).last().click();

  const tray = turnTray(player);
  await expect(tray).toBeVisible();
  await clickWhereShown(
    player,
    battlefield(player).getByRole('button', { name: /Elowen Starwhisper \(you\)/ }),
  );
  for (const name of ['Dodge', 'Dash', 'Disengage', 'Search', 'Study', 'Utilize: use an object']) {
    await expect(tray.getByRole('button', { name, exact: true })).toBeEnabled();
  }
  await tray.getByRole('button', { name: 'Search', exact: true }).click();
  const choice = tray.getByRole('form', { name: 'Search' });
  await choice.getByLabel('Skill', { exact: true }).selectOption({ label: 'Insight' });
  await expectAccessible(player, 'the Search action asking its skill');
  expectAccepted(await submit(player, choice.getByRole('button', { name: 'Search', exact: true })));
  // The check joins the table's log, and the action is spent for this turn.
  await openSheet(player, 'Dice');
  await expect(player.locator('#sheet-dice')).toContainText('Insight');
  await player.keyboard.press('Escape');
  await clickWhereShown(
    player,
    battlefield(player).getByRole('button', { name: /Elowen Starwhisper \(you\)/ }),
  );
  await expect(tray.getByRole('button', { name: 'Dodge', exact: true })).toBeDisabled();
});
