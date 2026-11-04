import { expect as baseExpect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import {
  COMBAT_CAMPAIGNS,
  clickWhereShown,
  enterCombat,
  square,
  turnTray,
} from './support/combat.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openCharacter, openSheet } from './support/shell.ts';

/**
 * The class features in play (docs/adr/0056-characters-from-the-srd.md §4): the DM wounds Brann
 * Ironvale, a Fighter 15, and uses his Second Wind from his sheet — the World Engine rolls and
 * heals — then reads Action Surge in its words. A Russian table reads them in Russian.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const BRANN = 'Brann Ironvale';

test('the DM uses a wounded Fighter’s Second Wind and reads his features’ words', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await enterWorld(page, TOKENS.dm, 'ui-class-features');
  await openSheet(page, 'Party');
  const card = page.locator('.party-list > li').filter({ hasText: BRANN });
  await card.getByRole('button', { name: `Damage or heal: ${BRANN}`, exact: true }).click();
  const form = card.locator('form.hand-form').first();
  await form.getByLabel('Amount', { exact: true }).fill('40');
  await form.getByLabel('Damage type', { exact: true }).selectOption({ label: 'Slashing' });
  await form.getByLabel('Why (kept in your history)', { exact: true }).fill('An ogre’s club');
  await form.getByRole('button', { name: 'Deal the damage', exact: true }).click();
  await expect(card.locator('.party-hp')).toContainText('99/139');
  await card.getByRole('button', { name: `Open the sheet of ${BRANN}`, exact: true }).click();
  const overview = await openCharacter(page, 'Overview', 'Character');
  const features = overview.getByRole('region', { name: 'Class features' });
  // A Champion 15: the World Engine applies its wider Critical Hits and its Advantage itself.
  await expect(features).toContainText('Superior Critical: a Critical Hit on an 18, 19 or 20.');
  await expect(features).toContainText('Remarkable Athlete');
  const secondWind = features.locator('.feature-row').filter({ hasText: 'Second Wind' });
  await expect(secondWind).toContainText('4 of 4 left');
  await expect(features.locator('.feature-row').filter({ hasText: 'Action Surge' })).toContainText(
    '1 of 1 left',
  );
  await secondWind.getByRole('button', { name: 'Use Second Wind', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText(/Second Wind: \d+ hit points back\./),
  ).toBeVisible();
  await expect(secondWind).toContainText('3 of 4 left');
  // Every feature in its words, on demand.
  await features.getByText('Every class feature, in its words').click();
  const surge = features.locator('.feature-word-list details').filter({ hasText: 'Action Surge' });
  await surge.locator('summary').click();
  await expect(surge).toContainText('additional action');
  await expectAccessible(page, 'the class features');
});

test('a Russian table reads the class features in Russian', async ({ page }) => {
  test.setTimeout(90_000);
  // The campaign's language is the table's: the persona sign-in stays English.
  await enterWorld(page, TOKENS.dm, 'ui-class-features-ru');
  await openSheet(page, 'Отряд');
  const card = page.locator('.party-list > li').filter({ hasText: 'Бранн' });
  await card.getByRole('button', { name: /лист/i }).click();
  const overview = await openCharacter(page, 'Обзор', 'Персонаж');
  const features = overview.getByRole('region', { name: 'Умения класса' });
  await expect(features).toContainText('Второе дыхание');
  await expect(features).toContainText('осталось 4 из 4');
  await features.getByText('Все умения класса — текст правил').click();
  await expect(features.locator('.feature-word-list')).toContainText('Всплеск действий');
});

test('a Sorcerer spends Quickened Spell on Fire Bolt in the turn tray', async ({ page }) => {
  test.setTimeout(90_000);
  await enterCombat(page, COMBAT_CAMPAIGNS.metamagic);
  await clickWhereShown(page, square(page, 8, 4));
  const tray = turnTray(page);
  await tray.getByRole('button', { name: /^Cast Fire Bolt at / }).click();
  const asked = tray.getByRole('group', { name: 'Fire Bolt: how?' });
  await asked
    .getByLabel('Metamagic', { exact: true })
    .selectOption({ label: 'Quickened Spell (2 Sorcery Points)' });
  await expectAccessible(page, 'the Metamagic question');
  await asked.getByRole('button', { name: 'Cast Fire Bolt', exact: true }).click();
  await expect(page.getByText(/Fire Bolt resolved on 1 target/)).toBeVisible();
  // Two of her five Sorcery Points spent.
  const overview = await openCharacter(page, 'Overview');
  await expect(
    overview.locator('.feature-row').filter({ hasText: 'Sorcery Points' }),
  ).toContainText('3 of 5 points');
});
