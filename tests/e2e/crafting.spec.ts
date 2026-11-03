import { expect as baseExpect, test } from '@playwright/test';

import { UI_ITEM_CAMPAIGNS } from '../../apps/server/src/testing/ui-item-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openCharacter, openSheet } from './support/shell.ts';

/**
 * Crafting (Stage 670f, docs/adr/0057-encounters-maps-loot.md §9): Elowen, who knows the Herbalism
 * Kit and carries one, begins a Potion of Healing with Brann helping — 25 crowns of materials, a
 * day's work shared by two — and sees her prepared spells offered as scrolls. The DM gives a day
 * of downtime from the Party sheet; the potion is in her pack.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_ITEM_CAMPAIGNS.craft;

test('Elowen brews a Potion of Healing with Brann, and a day of downtime makes it', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const player = await (await browser.newContext()).newPage();
  const dm = await (await browser.newContext()).newPage();
  await enterWorld(player, TOKENS.player, CAMPAIGN);
  const pack = await openCharacter(player, 'Inventory');
  const crafting = pack.locator('.crafting');
  await crafting.getByText('Begin a project', { exact: true }).click();
  const what = crafting.getByLabel('What to make', { exact: true });
  // Her wizard's prepared spells, offered as scrolls (she knows the calligrapher's supplies).
  await expect(what.locator('optgroup[label="Spell Scrolls"] option')).not.toHaveCount(0);
  await what.selectOption({ label: 'Potion of Healing' });
  await crafting.getByRole('checkbox', { name: 'Brann Ironvale' }).check();
  const sum = crafting.locator('.craft-sum');
  await expect(sum).toContainText('Materials: 25 cr');
  await expect(sum).toContainText('Days of work: 1, shared by 2: 0.5 each');
  await expectAccessible(player, 'beginning a crafting project');
  await crafting.getByRole('button', { name: 'Begin the work', exact: true }).click();
  await expect(
    player
      .getByRole('status')
      .filter({ hasText: 'You began the work, and paid for the materials.' }),
  ).toBeVisible();
  const project = crafting.locator('.crafting-project');
  await expect(project).toContainText('Potion of Healing');
  await expect(project).toContainText('Helped by Brann Ironvale');
  await expect(project).toContainText('Days of work: 0 of 1');

  // The DM gives a day of downtime.
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await openSheet(dm, 'Party');
  const downtime = dm.locator('.downtime');
  await expect(downtime).toContainText('Potion of Healing');
  await expect(downtime).toContainText('Elowen Starwhisper, Brann Ironvale');
  await expectAccessible(dm, 'the DM’s downtime');
  await downtime.getByRole('button', { name: 'Give the days to every project' }).click();
  await expect(downtime).toContainText('No one is crafting.');

  // The potion is in her pack; she may begin anew.
  await expect(project).toHaveCount(0);
  await expect(pack.getByRole('button', { name: /^Potion of Healing/ })).toBeVisible();
  await expect(crafting.getByText('Begin a project', { exact: true })).toBeVisible();
});

test('a Russian table crafts in Russian', async ({ browser }) => {
  const player = await (await browser.newContext()).newPage();
  await enterWorld(player, TOKENS.player, UI_ITEM_CAMPAIGNS.craftRu);
  const pack = await openCharacter(player, 'Снаряжение', 'Персонаж');
  const crafting = pack.locator('.crafting');
  await expect(crafting.getByRole('heading', { name: 'Ремесло' })).toBeVisible();
  await crafting.getByText('Начать работу', { exact: true }).click();
  const what = crafting.getByLabel('Что создать', { exact: true });
  await expect(what.locator('optgroup[label="Набор травника"] option')).toContainText([
    'Зелье лечения',
  ]);
  await what.selectOption({ label: 'Зелье лечения' });
  await expect(crafting.locator('.craft-sum')).toContainText('Материалы: 25 кр.');
});
