import { randomUUID } from 'node:crypto';

import { expect as baseExpect, test } from '@playwright/test';

import { UI_ITEM_CAMPAIGNS } from '../../apps/server/src/testing/ui-item-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openCharacter } from './support/shell.ts';

/**
 * Merchants (Stage 670f, docs/adr/0057-encounters-maps-loot.md §8): the DM makes Mira Vale a
 * merchant at Market Square and gives her a cowl to sell (three crowns' worth) and a brigandine
 * past Elowen's purse, whose Buy stays off and says why. Elowen trades with her: buys the cowl at
 * its price, her coins spent and the change made, then sells it back at half its worth.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_ITEM_CAMPAIGNS.trade;

test('Mira Vale keeps a shop; Elowen buys a cowl and sells it back', async ({ browser }) => {
  test.setTimeout(180_000);
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);

  // The DM opens Mira's shop at the worth, and gives her a cowl to sell.
  await dm.getByRole('button', { name: 'Mira Vale', exact: true }).first().click();
  const shop = dm.locator('.npc-shop');
  await shop
    .getByLabel('Keeps a shop', { exact: true })
    .selectOption({ label: 'Prices at 100% of the worth' });
  await expect(shop).toContainText('Nothing for sale yet');
  await expectAccessible(dm, 'the DM’s shop');
  const ware = async (catalogId: string) => {
    const given = await dm.request.post(
      `/api/campaigns/${CAMPAIGN}/items/catalog/${catalogId}/give`,
      {
        headers: { authorization: `Bearer ${TOKENS.dm}` },
        data: { requestId: randomUUID(), holderId: 'mira-vale', quantity: 1, forSale: true },
      },
    );
    expect(given.status()).toBe(200);
    return ((await given.json()) as { name: string }).name;
  };
  const name = await ware('hooded-cowl');
  await expect(shop).toContainText(`For sale: ${name}.`);
  // And a brigandine past Elowen's purse.
  const dear = await ware('ravenford-brigandine');
  await expect(shop).toContainText(dear);

  // Elowen trades with her.
  await enterWorld(player, TOKENS.player, CAMPAIGN);
  await player.getByRole('button', { name: 'Mira Vale', exact: true }).first().click();
  await player.getByRole('button', { name: 'Trade', exact: true }).click();
  const offer = player.locator('.shop');
  const buy = offer.getByRole('button', { name: `Buy ${name} for 3 cr`, exact: true });
  await expect(buy).toBeVisible();
  const dearBuy = offer.getByRole('button', { name: new RegExp(`^Buy ${dear} for`) });
  await expect(dearBuy).toBeDisabled();
  await expect(dearBuy).toHaveAccessibleDescription('Not enough coins');
  await expectAccessible(player, 'a merchant’s shop');
  await buy.click();
  await expect(
    player.getByRole('status').filter({ hasText: 'You bought it, and paid.' }),
  ).toBeVisible();
  // Sold back at half its worth: a crown and five marks.
  await offer.getByRole('button', { name: `Sell ${name} for 1 cr · 5 m`, exact: true }).click();
  await expect(
    player.getByRole('status').filter({ hasText: 'You sold it, and were paid.' }),
  ).toBeVisible();
  const sheet = await openCharacter(player, 'Inventory');
  await expect(sheet.getByRole('button', { name: new RegExp(`^${name}`) })).toHaveCount(0);
});
