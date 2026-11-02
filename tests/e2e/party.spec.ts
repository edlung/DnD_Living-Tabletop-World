import { expect as baseExpect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * A party for the table (Stage 605): Elowen's three companions stand with her on the Old Trade
 * Road, and the DM starts the prepared ambush in one step — eleven foes placed and the fight begun
 * with the four of them, the player's screen following without a refresh. Russian too.
 */
const expect = baseExpect.configure({ timeout: 15_000 });

const encounterSheet = (page: Page) => page.locator('#sheet-encounter');
const turnOrder = (page: Page) => page.getByRole('list', { name: 'Turn order', exact: true });

test('the DM starts the prepared ambush for the party of four in one step', async ({ browser }) => {
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, UI_PARTY_CAMPAIGNS.ambush);
  await enterWorld(player, TOKENS.player, UI_PARTY_CAMPAIGNS.ambush);
  await openSheet(dm, 'Encounter');
  const prepared = encounterSheet(dm).getByRole('region', { name: 'Prepared encounters' });
  const row = prepared.getByRole('listitem').filter({ hasText: 'Ambush on the Old Trade Road' });
  await expect(row).toContainText('Foes: 11');
  await expect(row).toContainText(
    'Joining: Brann Ironvale, Elowen Starwhisper, Maren Ashby, Tamsin Quickfoot',
  );
  await expectAccessible(dm, 'the prepared ambush');
  await row
    .getByRole('button', { name: 'Start: Ambush on the Old Trade Road', exact: true })
    .click();
  await expect(
    encounterSheet(dm).getByRole('heading', { name: 'Encounter controls (DM)' }),
  ).toBeVisible();
  await expect(turnOrder(dm).getByRole('listitem')).toHaveCount(15);
  // Her player's screen follows: the battlefield, with Elowen and her companions in the order.
  await expect(turnOrder(player).getByRole('listitem')).toHaveCount(15);
  await expect(turnOrder(player)).toContainText('Maren Ashby');
});

test('in Russian, the ambush is ready for the whole party', async ({ browser }) => {
  const dm = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, UI_PARTY_CAMPAIGNS.ru);
  await openSheet(dm, 'Схватка');
  const row = encounterSheet(dm)
    .getByRole('region', { name: 'Подготовленные столкновения' })
    .getByRole('listitem')
    .filter({ hasText: 'Засада на Старой Торговой дороге' });
  await expect(row).toContainText('Противники: 11');
  await expect(row).toContainText('Участвуют: Бранн Айронвейл');
});
