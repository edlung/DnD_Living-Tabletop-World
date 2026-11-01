import { expect, test, type Page } from '@playwright/test';

import { expectAccessible, WIDTHS } from './support/axe.ts';
import { enterWorld, expectPlayerBoundary, TOKENS } from './support/session.ts';
import { closeCharacter, openCharacter } from './support/shell.ts';

/**
 * Item possession in the browser (docs/adr/0039-item-possession.md): the character dialog's
 * Inventory shows the acting character's own pack — the purse and load, the paper doll, the bag and
 * the chosen item's card (Stage 520); wearing and using go through the World Engine, handing over
 * needs someone present, and a thing on the ground can be picked up. Each journey owns a campaign
 * (`ui-item-campaigns.ts`).
 */
const CAMPAIGNS = {
  play: 'ui-items-play',
  take: 'ui-items-take',
  ru: 'ui-items-ru',
  axe: 'ui-items-axe',
  fight: 'ui-items-fight',
  split: 'ui-items-split',
} as const;

/** The item's tile in the bag, or its slot on the paper doll ("Body: Ravenford brigandine"). */
const itemControl = (page: Page, name: string) =>
  page
    .getByRole('dialog')
    .locator('.bag-tile, .doll-frame')
    .and(page.getByRole('button', { name: new RegExp(`(^|: )${name}`) }));

/** Chooses an item and returns its card. */
async function openItem(page: Page, name: string) {
  await itemControl(page, name).first().click();
  const card = page.getByRole('dialog').locator('.item-card');
  await expect(card.getByRole('heading', { name: new RegExp(`^${name}`) })).toBeVisible();
  return card;
}

test('the pack lists worn and carried items, and wearing and using change them', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.play);
  const sheet = await openCharacter(page, 'Inventory');
  await expect(sheet.getByRole('region', { name: 'Carried' })).toBeVisible();
  // The purse counts the coins; the load is the pack's weight against Strength × 15 lb.
  // Fifteen crowns from Ravenford's seed and twelve from this campaign's.
  await expect(sheet.getByRole('region', { name: 'Purse' })).toContainText('27');
  await expect(sheet.getByRole('region', { name: 'Load' })).toContainText('of 150 lb');
  // Catalog pictures (Stage 480) load; they are decorative, so each carries an empty alt.
  const pictures = sheet.locator('.bag-art img');
  await expect(pictures.first()).toBeVisible();
  expect(
    await pictures.evaluateAll((images) =>
      images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
    ),
  ).toBe(true);
  await expect(sheet.getByRole('button', { name: 'Body: empty' })).toBeVisible();

  const brigandine = await openItem(page, 'Ravenford brigandine');
  await brigandine.getByRole('button', { name: 'Wear', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Body: Ravenford brigandine' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'You put it on.' })).toBeVisible();

  const worn = await openItem(page, 'Ravenford brigandine');
  await expect(worn.getByRole('button', { name: 'Take off', exact: true })).toBeVisible();
  await expect(worn.getByRole('button', { name: 'Drop', exact: true })).toHaveCount(0);

  const balm = await openItem(page, 'Spare balm');
  await expect(page.getByRole('button', { name: 'Spare balm, 2' })).toBeVisible();
  await balm.getByRole('button', { name: 'Use', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'You used it.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Spare balm', exact: true })).toBeVisible();
  await expectPlayerBoundary(page);
});

test('an item can be handed to someone who is here, and dropped', async ({ page }) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.play);
  await openCharacter(page, 'Inventory');
  const cloak = await openItem(page, 'Grey road cloak');
  await cloak
    .getByLabel('Give Grey road cloak to', { exact: true })
    .selectOption({ label: 'Mira Vale' });
  await cloak.getByRole('button', { name: 'Give', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'You handed it over.' })).toBeVisible();
  await expect(itemControl(page, 'Grey road cloak')).toHaveCount(0);

  const buckler = await openItem(page, 'Oak buckler');
  await buckler.getByRole('button', { name: 'Drop', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'You dropped it.' })).toBeVisible();
  await expect(itemControl(page, 'Oak buckler')).toHaveCount(0);
});

test('part of a stack can be handed over', async ({ page }) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.split);
  await openCharacter(page, 'Inventory');
  const balm = await openItem(page, 'Spare balm');
  await balm.getByLabel('How many of Spare balm', { exact: true }).fill('1');
  await balm.getByLabel('Give Spare balm to', { exact: true }).selectOption({ label: 'Mira Vale' });
  await balm.getByRole('button', { name: 'Give', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'You handed it over.' })).toBeVisible();
  // One is left in the pack.
  await expect(page.getByRole('button', { name: 'Spare balm', exact: true })).toBeVisible();
});

test('a weapon shows its attack and goes in hand; a dragged item goes onto the doll', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.split);
  const sheet = await openCharacter(page, 'Inventory');
  const blade = await openItem(page, 'Practice blade');
  // Finesse: Dexterity +4 and proficiency +5 to hit; 1d6 + 4 piercing.
  await expect(blade).toContainText('+9');
  await expect(blade).toContainText('1d6 + 4');
  await expect(blade).toContainText('Finesse');
  // A light blade fits either hand; the main hand holds the bow the seed gave her, so it is freed
  // first, then the blade goes in.
  await blade.getByLabel('Slot for Practice blade').selectOption({ label: 'Main hand' });
  await expect(blade.getByRole('button', { name: 'Wield', exact: true })).toBeDisabled();
  await blade.getByRole('button', { name: /^Take off/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'You took it off.' })).toBeVisible();
  await blade.getByRole('button', { name: 'Wield', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Main hand: Practice blade' })).toBeVisible();
  // Dragged from the bag onto the off hand.
  await itemControl(page, 'Oak buckler').dragTo(sheet.locator('.doll-slot--offhand'));
  await expect(sheet.getByRole('button', { name: 'Off hand: Oak buckler' })).toBeVisible();
  // The sheet's attacks now list the blade in hand.
  const overview = await openCharacter(page, 'Overview');
  await expect(overview.locator('.attack-row')).toContainText(['Longbow', 'Shortsword']);
});

test('a thing on the ground is picked up from the scene', async ({ page }) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.take);
  await openCharacter(page, 'Inventory');
  await expect(itemControl(page, 'Dented lantern')).toHaveCount(0);
  await closeCharacter(page);
  await page
    .getByRole('list', { name: 'Visible world objects' })
    .getByRole('button', { name: /Unidentified item/ })
    .click();
  await page.getByRole('button', { name: 'Pick up', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'You picked it up.' })).toBeVisible();
  await openCharacter(page, 'Inventory');
  await expect(itemControl(page, 'Dented lantern')).toBeVisible();
});

test('in a fight a potion costs the Bonus Action, once a turn', async ({ page }) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.fight);
  const sheet = await openCharacter(page, 'Inventory');
  await expect(sheet.getByRole('note')).toContainText('Bonus Action');
  const balm = await openItem(page, "Orin's balm");
  await balm.getByRole('button', { name: 'Use', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'You used it.' })).toBeVisible();
  const again = await openItem(page, "Orin's balm");
  await again.getByRole('button', { name: 'Use', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /no bonus action/i })).toBeVisible();
  // Armor waits for the end of the fight.
  const cloak = await openItem(page, 'Travel-worn cloak');
  await expect(cloak.getByRole('button', { name: 'Wear', exact: true })).toBeEnabled();
});

test('the DM perspective has no character of its own to open', async ({ page }) => {
  await enterWorld(page, TOKENS.dm, CAMPAIGNS.play);
  await expect(
    page.locator('nav.dock').getByRole('button', { name: 'Journal', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('nav.dock').getByRole('button', { name: 'Character', exact: true }),
  ).toHaveCount(0);
});

test('a Russian pack reads only Russian', async ({ page }) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.ru);
  const sheet = await openCharacter(page, 'Снаряжение', 'Персонаж');
  await expect(sheet.getByRole('region', { name: 'В сумке' })).toBeVisible();
  const bag = await openItem(page, 'Равенфордский бригандин');
  await expect(bag.getByRole('button', { name: 'Надеть', exact: true })).toBeVisible();
  const text = await sheet.innerText();
  expect((text.match(/[A-Za-z][A-Za-z'’-]{2,}/g) ?? []).join(' ')).toBe('');
});

for (const size of WIDTHS) {
  test(`the character's inventory passes axe at ${size.name} width`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await enterWorld(page, TOKENS.player, CAMPAIGNS.axe);
    await openCharacter(page, 'Inventory');
    await openItem(page, 'Oak buckler');
    await expectAccessible(page, `${size.name} items sheet`);
  });
}
