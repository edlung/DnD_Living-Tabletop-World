import { expect as baseExpect, test } from '@playwright/test';

import { UI_SUMMON_CAMPAIGNS } from '../../apps/server/src/testing/ui-summon-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { battlefield, clickSquare, enterCombat, turnTray } from './support/combat.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { closeCharacter, openCharacter } from './support/shell.ts';

/**
 * Wild Shape (docs/adr/0056-characters-from-the-srd.md §5): in the road ambush Elowen, a 4th-level
 * Druid, takes a wolf's shape from her class features; the battlefield says so, and her turn offers
 * the wolf's Bite where her longbow and spells were. A Russian table takes and leaves the shape in
 * Russian.
 */
const expect = baseExpect.configure({ timeout: 15_000 });

test('Elowen takes a wolf’s shape in a fight and her turn offers its Bite', async ({ page }) => {
  test.setTimeout(120_000);
  await enterCombat(page, UI_SUMMON_CAMPAIGNS.shapeFight);
  const overview = await openCharacter(page, 'Overview');
  const row = overview
    .getByRole('region', { name: 'Class features' })
    .locator('.feature-row')
    .filter({ hasText: 'Wild Shape' });
  await row.getByLabel('Beast form', { exact: true }).selectOption({ label: 'Wolf (CR 1/4)' });
  await expectAccessible(page, 'Wild Shape’s forms');
  await row.getByRole('button', { name: 'Take the shape', exact: true }).click();
  await expect(page.getByText('You take the Beast’s shape: 1 use left.').first()).toBeVisible();
  await expect(row).toContainText('In the shape of: Wolf');
  await closeCharacter(page);

  await clickSquare(page, 2, 6);
  await expect(battlefield(page).getByRole('region', { name: /Options for Elowen/ })).toContainText(
    'in the shape of: Wolf',
  );
  await page.keyboard.press('Escape');
  await clickSquare(page, 8, 4);
  await expect(
    turnTray(page).getByRole('button', { name: 'Bite at Unidentified creature 1' }),
  ).toBeVisible();
  await expect(
    turnTray(page).getByRole('button', { name: /^Attack Unidentified creature 1 with longbow/ }),
  ).toHaveCount(0);
  await expect(turnTray(page).getByRole('button', { name: /^Cast Fireball/ })).toHaveCount(0);
});

test('a Russian table takes and leaves a Wild Shape in Russian', async ({ page }) => {
  test.setTimeout(120_000);
  await enterWorld(page, TOKENS.player, UI_SUMMON_CAMPAIGNS.shapeRu);
  const overview = await openCharacter(page, 'Обзор', 'Персонаж');
  const row = overview
    .getByRole('region', { name: 'Умения класса' })
    .locator('.feature-row')
    .filter({ hasText: 'Дикий облик' });
  await row.getByLabel('Облик зверя', { exact: true }).selectOption({ label: 'Волк (ПО 1/4)' });
  await row.getByRole('button', { name: 'Принять облик', exact: true }).click();
  await expect(row).toContainText('В облике: Волк');
  await expectAccessible(page, 'Wild Shape in Russian');
  await row.getByRole('button', { name: 'Покинуть облик', exact: true }).click();
  await expect(row).not.toContainText('В облике');
});
