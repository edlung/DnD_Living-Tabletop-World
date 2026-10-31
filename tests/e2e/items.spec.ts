import { expect, test, type Page } from '@playwright/test';

import { expectAccessible, WIDTHS } from './support/axe.ts';
import { enterWorld, expectPlayerBoundary, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * Item possession in the browser (docs/adr/0039-item-possession.md): the Items sheet shows the
 * acting character's own pack, wearing and using go through the World Engine, handing over
 * needs someone present, and a thing on the ground can be picked up. Each journey owns a
 * campaign (`ui-item-campaigns.ts`).
 */
const CAMPAIGNS = {
  play: 'ui-items-play',
  take: 'ui-items-take',
  ru: 'ui-items-ru',
  axe: 'ui-items-axe',
} as const;

const row = (page: Page, name: string | RegExp) =>
  page.locator('.item-row').filter({ has: page.getByRole('button', { name }) });

async function openItem(page: Page, name: string) {
  const summary = page.getByRole('button', { name: new RegExp(`^${name}`) });
  if ((await summary.getAttribute('aria-expanded')) !== 'true') await summary.click();
  return row(page, new RegExp(`^${name}`));
}

test('the pack lists worn and carried items, and wearing and using change them', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.play);
  await openSheet(page, 'Items');
  const sheet = page.locator('#sheet-items');
  await expect(sheet.getByRole('heading', { name: 'Carried' })).toBeVisible();
  await expect(sheet).toContainText('Carrying');
  await expect(sheet.getByRole('heading', { name: 'Worn' })).toHaveCount(0);

  const brigandine = await openItem(page, 'Ravenford brigandine');
  await brigandine.getByRole('button', { name: 'Wear', exact: true }).click();
  await expect(sheet.getByRole('heading', { name: 'Worn' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'You put it on.' })).toBeVisible();

  const worn = await openItem(page, 'Ravenford brigandine');
  await expect(worn.getByRole('button', { name: 'Take off', exact: true })).toBeVisible();
  await expect(worn.getByRole('button', { name: 'Drop', exact: true })).toHaveCount(0);

  const balm = await openItem(page, "Orin's balm");
  await expect(page.getByRole('button', { name: /^Orin's balm.*×2/ })).toBeVisible();
  await balm.getByRole('button', { name: 'Use', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'You used it.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Orin's balm/ })).not.toContainText('×');
  await expectPlayerBoundary(page);
});

test('an item can be handed to someone who is here, and dropped', async ({ page }) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.play);
  await openSheet(page, 'Items');
  const cloak = await openItem(page, 'Grey road cloak');
  await cloak
    .getByLabel('Give Grey road cloak to', { exact: true })
    .selectOption({ label: 'Mira Vale' });
  await cloak.getByRole('button', { name: 'Give', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'You handed it over.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Grey road cloak/ })).toHaveCount(0);

  const buckler = await openItem(page, 'Oak buckler');
  await buckler.getByRole('button', { name: 'Drop', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'You dropped it.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Oak buckler/ })).toHaveCount(0);
});

test('a thing on the ground is picked up from the scene', async ({ page }) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.take);
  await openSheet(page, 'Items');
  await expect(page.locator('#sheet-items')).toContainText('You carry nothing yet.');
  await page.locator('nav.dock').getByRole('button', { name: 'Scene', exact: true }).click();
  await page
    .getByRole('list', { name: 'Visible world objects' })
    .getByRole('button', { name: /Unidentified item/ })
    .click();
  await page.getByRole('button', { name: 'Pick up', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'You picked it up.' })).toBeVisible();
  await openSheet(page, 'Items');
  await expect(page.getByRole('button', { name: /^Dented lantern/ })).toBeVisible();
});

test('the DM sees no pack of their own', async ({ page }) => {
  await enterWorld(page, TOKENS.dm, CAMPAIGNS.play);
  await openSheet(page, 'Items');
  await expect(page.locator('#sheet-items')).toContainText(
    'Choose a character to see what they carry.',
  );
});

test('a Russian pack reads only Russian', async ({ page }) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.ru);
  await openSheet(page, 'Вещи');
  const sheet = page.locator('#sheet-items');
  await expect(sheet.getByRole('heading', { name: 'В сумке' })).toBeVisible();
  const bag = await openItem(page, 'Равенфордский бригандин');
  await expect(bag.getByRole('button', { name: 'Надеть', exact: true })).toBeVisible();
  const text = await sheet.innerText();
  expect((text.match(/[A-Za-z][A-Za-z'’-]{2,}/g) ?? []).join(' ')).toBe('');
});

for (const size of WIDTHS) {
  test(`the Items sheet passes axe at ${size.name} width`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await enterWorld(page, TOKENS.player, CAMPAIGNS.axe);
    await openSheet(page, 'Items');
    await openItem(page, 'Oak buckler');
    await expectAccessible(page, `${size.name} items sheet`);
  });
}
