import { expect as baseExpect, test, type Locator } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openCharacter, openSheet } from './support/shell.ts';
import { SIGN_IN_CAMPAIGNS, SIGN_IN_ORIGIN, WORDS, joinAsDm } from './support/sign-in.ts';

/**
 * The character builder (docs/adr/0056-characters-from-the-srd.md §2): the DM makes a level 1
 * Dwarf Fighter, a Soldier, step by step; each step is marked while its choices do not hold; the
 * World Engine makes her with her gear worn, and the invitation form offers her to a player. A
 * Russian table reads the builder in Russian.
 */
const expect = baseExpect.configure({ timeout: 15_000 });

const next = (dialog: Locator) => dialog.getByRole('button', { name: 'Next', exact: true }).click();

test('the DM makes a level 1 character step by step and may invite a player to her', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const dm = await (await browser.newContext({ baseURL: SIGN_IN_ORIGIN })).newPage();
  await joinAsDm(dm, SIGN_IN_CAMPAIGNS.builder);
  await openSheet(dm, 'Players');
  const sheet = dm.locator('#sheet-players');
  await sheet.getByRole('button', { name: 'Make a character', exact: true }).click();
  const dialog = dm.getByRole('dialog', { name: 'Make a character' });
  await expect(dialog.getByRole('radio', { name: /^Fighter/ })).toBeVisible();

  await dialog.getByRole('radio', { name: /^Fighter/ }).click();
  await expect(dialog).toContainText('Second Wind');
  await expectAccessible(dm, 'the builder’s class step');
  await next(dialog);
  await dialog.getByRole('radio', { name: /^Dwarf/ }).click();
  await dialog.getByRole('radio', { name: /^Soldier/ }).click();
  await next(dialog);
  // The standard array as offered; Strength and Constitution raised by the Soldier.
  await expect(dialog.getByLabel('Strength', { exact: true })).toHaveValue('15');
  await next(dialog);

  const skills = dialog.getByRole('group', { name: /^Class skills/ });
  await skills.getByLabel('Acrobatics', { exact: true }).check();
  await skills.getByLabel('Perception', { exact: true }).check();
  await expect(skills.getByLabel('History', { exact: true })).toBeDisabled();
  await dialog
    .getByRole('group', { name: /^Tools/ })
    .getByLabel('Dice (Gaming Set)')
    .check();
  await dialog.getByRole('group', { name: 'Fighting style' }).getByLabel('Defense').check();
  const masteries = dialog.getByRole('group', { name: /^Weapon Mastery/ });
  for (const weapon of ['Greatsword', 'Flail', 'Javelin'])
    await masteries.getByLabel(weapon, { exact: true }).check();
  await expectAccessible(dm, 'the builder’s skills step');
  await next(dialog);
  await dialog
    .getByLabel('Gaming Set', { exact: true })
    .selectOption({ label: 'Dice (Gaming Set)' });
  await next(dialog);
  await expect(dialog).toContainText('Your class casts no spells at level 1.');
  await next(dialog);

  // Every step holds: the summary shows her numbers; the World Engine makes her.
  await expect(dialog.locator('.builder-nav-open')).toHaveCount(0);
  await expect(dialog).toContainText('Chain Mail');
  await dialog.getByLabel('Name', { exact: true }).fill('Brunna Stonehand');
  await expectAccessible(dm, 'the builder’s last step');
  await dialog.getByRole('button', { name: 'Make the character', exact: true }).click();
  await expect(
    sheet.getByRole('status').filter({ hasText: 'Brunna Stonehand is made.' }),
  ).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(
    sheet
      .getByLabel('Character', { exact: true })
      .locator('option', { hasText: 'Brunna Stonehand' }),
  ).toHaveCount(1);
});

test('a step whose choices do not hold is marked, and a Russian table reads it in Russian', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  // The sign-in screen speaks the browser's language; the table, the campaign's.
  const context = await browser.newContext({ baseURL: SIGN_IN_ORIGIN, locale: 'ru-RU' });
  const dm = await context.newPage();
  await joinAsDm(dm, SIGN_IN_CAMPAIGNS.builderRu, 0, WORDS.ru);
  await openSheet(dm, 'Игроки');
  await dm.getByRole('button', { name: 'Создать персонажа', exact: true }).click();
  const dialog = dm.getByRole('dialog', { name: 'Создать персонажа' });
  await dialog.getByRole('radio', { name: /^Волшебник/ }).click();
  await dialog.getByRole('button', { name: 'Далее', exact: true }).click();
  await dialog.getByRole('radio', { name: /^Elf/ }).click();
  await dialog.getByRole('radio', { name: /^Sage/ }).click();
  // The Elf's lineage is not chosen yet: the Origin step is marked, with the problem in Russian.
  await expect(dialog.locator('.builder-nav-open').first()).toBeVisible();
  await expect(dialog).toContainText('Выберите одно из: drow, high elf, wood elf');
  await expectAccessible(dm, 'the Russian builder');
});

test('a player makes another character of their own from the character dialog', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await enterWorld(page, TOKENS.player, 'ui-builder-player');
  const overview = await openCharacter(page, 'Overview');
  await overview.getByRole('button', { name: 'Make a character', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Make a character' });
  await dialog.getByRole('radio', { name: /^Rogue/ }).click();
  await next(dialog);
  await dialog.getByRole('radio', { name: /^Halfling/ }).click();
  await dialog.getByRole('radio', { name: /^Criminal/ }).click();
  await next(dialog);
  await next(dialog);
  const skills = dialog.getByRole('group', { name: /^Class skills/ });
  for (const skill of ['Acrobatics', 'Athletics', 'Deception', 'Insight'])
    await skills.getByLabel(skill, { exact: true }).check();
  const expertise = dialog.getByRole('group', { name: /^Expertise/ });
  for (const skill of ['Stealth', 'Acrobatics'])
    await expertise.getByLabel(skill, { exact: true }).check();
  const masteries = dialog.getByRole('group', { name: /^Weapon Mastery/ });
  for (const weapon of ['Dagger', 'Shortsword'])
    await masteries.getByLabel(weapon, { exact: true }).check();
  for (let step = 0; step < 3; step += 1) await next(dialog);
  await expect(dialog.locator('.builder-nav-open')).toHaveCount(0);
  await dialog.getByLabel('Name', { exact: true }).fill('Pip Underbough');
  await dialog.getByRole('button', { name: 'Make the character', exact: true }).click();
  await expect(
    overview.getByRole('status').filter({ hasText: 'Pip Underbough is made.' }),
  ).toBeVisible();
  // The new character is the player's: the perspective control offers her.
  await page.keyboard.press('Escape');
  const perspective = page.getByLabel('Perspective', { exact: true });
  await expect(perspective.locator('option', { hasText: 'Pip Underbough' })).toHaveCount(1);
});
