import { expect as baseExpect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { COMBAT_CAMPAIGNS, enterCombat } from './support/combat.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openCharacter, openSheet } from './support/shell.ts';

/**
 * The SRD's catalogs in Russian and their pictures by kind (docs/adr/0055-rules-reference-and-
 * toolbox.md §5–6): a Russian DM finds the SRD's Rope by its Russian name and gives it; the pack
 * and the card read it in Russian, with the SRD's words, and the card shows the gear's picture.
 * The bestiary shows a stat block's creature type, a swarm its members' type.
 */
const expect = baseExpect.configure({ timeout: 15_000 });

test('a Russian DM gives the SRD’s Rope by its Russian name, and its card reads Russian', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm, 'ui-items-catalog-ru');
  await page.locator('.rail-member').filter({ hasText: 'Эловен Старвиспер' }).click();
  await page.getByRole('button', { name: 'Полный лист персонажа' }).click();
  const pack = await openCharacter(page, 'Снаряжение', 'Персонаж');
  await pack.getByText('Выдать предмет из каталога', { exact: true }).click();
  const form = pack.getByRole('form', { name: 'Выдать предмет из каталога' });
  await form.getByLabel('Найти по названию', { exact: true }).fill('верёв');
  const item = form.getByLabel('Предмет', { exact: true });
  await expect(item).toContainText('Верёвка (SRD)');
  await item.selectOption({ label: 'Верёвка (SRD)' });
  await form.getByRole('button', { name: 'Выдать' }).click();
  await expect(form.getByRole('status')).toHaveText('Верёвка — теперь в снаряжении.');

  await pack
    .getByRole('button', { name: /^Верёвка/ })
    .first()
    .click();
  const card = pack.locator('.item-card');
  await expect(card).toContainText('завязать узел на верёвке');
  await expect(card).not.toContainText('Utilize');
  await expect(card.locator('.item-card-art img')).toHaveAttribute('src', /kind-gear/);
  await expectAccessible(page, 'a Russian SRD item’s card');
});

test('the bestiary shows a stat block’s creature type, a swarm its members’', async ({ page }) => {
  await enterCombat(page, COMBAT_CAMPAIGNS.bestiary, TOKENS.dm);
  await openSheet(page, 'Encounter');
  const form = page.getByRole('form', { name: 'From the bestiary' });
  const find = form.getByLabel('Find by name or type', { exact: true });
  const creature = form.getByLabel('Creature', { exact: true });
  await find.fill('swarm of rats');
  await creature.selectOption('swarm-of-rats');
  await expect(form).toContainText('Swarm of Tiny Beasts');
  await expect(form.locator('.bestiary-type-art')).toHaveAttribute('src', /type-beast/);
  await find.fill('adult red');
  await creature.selectOption('adult-red-dragon');
  await expect(form.locator('.bestiary-type-art')).toHaveAttribute('src', /type-dragon/);
});
