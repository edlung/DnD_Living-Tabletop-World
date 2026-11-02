import { expect as baseExpect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openCharacter } from './support/shell.ts';

/**
 * The DM's item catalog (docs/adr/0054-items-as-data.md §4): with Elowen's pack open, the DM finds
 * the SRD's Rope and gives it, then twenty Arrows; the pack shows them and the Rope's card says
 * what the SRD says of it. A Longsword comes one at a time: it does not stack (a gift the World
 * Engine would refuse makes nothing: `apps/server/src/items/item-catalog-routes.test.ts`).
 */
const expect = baseExpect.configure({ timeout: 15_000 });

test('the DM gives items from the catalog, and the pack shows the SRD’s words', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm, 'ui-items-catalog');
  await page.locator('.rail-member').filter({ hasText: 'Elowen Starwhisper' }).click();
  await page.getByRole('button', { name: 'Full character sheet' }).click();
  const pack = await openCharacter(page, 'Inventory');
  await pack.getByText('Give an item from the catalog', { exact: true }).click();
  const form = pack.getByRole('form', { name: 'Give an item from the catalog' });
  await form.getByLabel('Find by name', { exact: true }).fill('rope');
  const item = form.getByLabel('Item', { exact: true });
  await expect(item).toContainText('Rope (SRD)');
  await item.selectOption({ label: 'Rope (SRD)' });
  await expect(form).toContainText('Gear · 1 cr · 5 lb');
  await expectAccessible(page, 'the item catalog form');
  await form.getByRole('button', { name: 'Give it' }).click();
  await expect(form.getByRole('status')).toHaveText('Rope is in the pack.');

  // Twenty arrows: they stack.
  await form.getByLabel('Find by name', { exact: true }).fill('arrow');
  await form.getByLabel('Item', { exact: true }).selectOption({ label: 'Arrow (SRD)' });
  await form.getByLabel('How many', { exact: true }).fill('20');
  await form.getByRole('button', { name: 'Give it' }).click();
  await expect(form.getByRole('status')).toHaveText('Arrow is in the pack.');
  await expect(pack.getByRole('button', { name: 'Arrow, 20' })).toBeVisible();

  // The Rope's card: the SRD's words.
  await pack.getByRole('button', { name: /^Rope/ }).first().click();
  const card = pack.locator('.item-card');
  await expect(card).toContainText('As a Utilize action, you can tie a knot with Rope');

  // A +1 weapon is made on what the DM names: a Longsword, so it is a "Longsword, +1".
  await form.getByLabel('Find by name', { exact: true }).fill('weapon, +1');
  await form.getByLabel('Item', { exact: true }).selectOption({ label: 'Weapon, +1 (SRD)' });
  await expect(form).toContainText('Uncommon');
  await form.getByLabel('Made on', { exact: true }).selectOption({ label: 'Longsword' });
  await form.getByRole('button', { name: 'Give it' }).click();
  await expect(form.getByRole('status')).toHaveText('Longsword, +1 is in the pack.');
  await pack
    .getByRole('button', { name: /^Longsword, \+1/ })
    .first()
    .click();
  await expect(card).toContainText('Uncommon');
  await expect(card).toContainText('+1 to attack and damage');

  // A longsword: one at a time, so no count is asked.
  await form.getByLabel('Find by name', { exact: true }).fill('longsword');
  await form.getByLabel('Item', { exact: true }).selectOption({ label: 'Longsword (SRD)' });
  await expect(form.getByLabel('How many', { exact: true })).toHaveCount(0);
  await form.getByRole('button', { name: 'Give it' }).click();
  await expect(form.getByRole('status')).toHaveText('Longsword is in the pack.');
  await expect(pack.getByRole('button', { name: /^Longsword/ }).first()).toBeVisible();
});

test('a player drinks a greater potion of healing, and the dice say how much it gave', async ({
  page,
}) => {
  // The DM gives two through the catalog; Elowen, hurt, drinks one.
  const give = await page.request.post(
    '/api/campaigns/ui-items-catalog/items/catalog/srd-potion-of-healing-greater/give',
    {
      headers: { authorization: `Bearer ${TOKENS.dm}` },
      data: { requestId: crypto.randomUUID(), holderId: 'elowen-starwhisper', quantity: 2 },
    },
  );
  expect(give.status()).toBe(200);
  await enterWorld(page, TOKENS.player, 'ui-items-catalog');
  const pack = await openCharacter(page, 'Inventory');
  await pack.getByRole('button', { name: /^Potion of Healing \(Greater\), 2/ }).click();
  const card = pack.locator('.item-card');
  await expect(card).toContainText('Restores 4d4 + 4 hit points');
  await card.getByRole('button', { name: 'Use', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /You drank it: \d+ hit points back\./ }),
  ).toBeVisible();
});
