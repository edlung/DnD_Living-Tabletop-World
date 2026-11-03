import { expect as baseExpect, test, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { closeCharacter, openCharacter, openSheet } from './support/shell.ts';

/**
 * The campaign's options (docs/adr/0056-characters-from-the-srd.md §3): on the Session sheet the
 * DM takes a level's hit points always fixed, levels by milestone, carrying enforced and new
 * characters at level 3; the history tells the change; the Party sheet grants the milestone's
 * level; Elowen's player takes it with the fixed hit points, and her four mail shirts — more than
 * her Strength carries — slow her to 5 ft. A Russian table reads it all in Russian.
 */
const expect = baseExpect.configure({ timeout: 15_000 });

async function setOptions(
  page: Page,
  words: {
    readonly region: string;
    readonly hitPoints: [string, string];
    readonly levels: [string, string];
    readonly carrying: [string, string];
    readonly start: string;
    readonly save: string;
  },
) {
  const form = page.locator('#sheet-session').getByRole('region', { name: words.region });
  await form
    .getByLabel(words.hitPoints[0], { exact: true })
    .selectOption({ label: words.hitPoints[1] });
  await form.getByLabel(words.levels[0], { exact: true }).selectOption({ label: words.levels[1] });
  await form
    .getByLabel(words.carrying[0], { exact: true })
    .selectOption({ label: words.carrying[1] });
  await form.getByLabel(words.start, { exact: true }).selectOption('3');
  await form.getByRole('button', { name: words.save }).click();
  // Read back from the World Engine: the saved set is the form's start, nothing left to save.
  await expect(form.getByRole('button', { name: words.save })).toBeDisabled();
  await expect(form.getByLabel(words.levels[0], { exact: true })).toHaveValue('milestone');
  return form;
}

test('the DM’s options give a milestone level with the fixed hit points, and a load that slows', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const dm = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, 'ui-campaign-options');
  await openSheet(dm, 'Session');
  await setOptions(dm, {
    region: 'Campaign options',
    hitPoints: ['Hit points at a new level', 'Always fixed'],
    levels: ['Levels', 'By milestone'],
    carrying: ['Carrying', 'Enforced'],
    start: 'New characters start at level',
    save: 'Save the options',
  });
  await expectAccessible(dm, 'the campaign options');
  await openSheet(dm, 'History');
  await expect(dm.locator('#sheet-history')).toContainText(
    'Campaign options: hit points always fixed; levels by milestone; carrying enforced; new characters at level 3',
  );
  // By milestone the Party sheet grants a level to each instead of awarding experience.
  await openSheet(dm, 'Party');
  await expect(dm.getByRole('region', { name: 'Experience', exact: true })).toHaveCount(0);
  const milestone = dm.getByRole('region', { name: 'Milestone', exact: true });
  await milestone.getByRole('button', { name: 'Grant a level to each' }).click();
  await expect(milestone.getByRole('status')).toHaveText('A level is granted to each to take.');

  const player = await (await browser.newContext()).newPage();
  await enterWorld(player, TOKENS.player, 'ui-campaign-options');
  const overview = await openCharacter(player, 'Overview');
  const levels = overview.getByRole('region', { name: 'Experience and levels' });
  await expect(levels).toContainText('Levels by milestone: the DM grants each level.');
  await expect(levels).toContainText('Levels granted by the DM to take: 1.');
  await expect(
    player.getByRole('dialog').locator('.hero-vital').filter({ hasText: 'Speed' }),
  ).toContainText('5 ft (load)');
  await levels.getByRole('button', { name: 'Take level 16' }).click();
  const dialog = player.getByRole('dialog', { name: 'Level 16' });
  const hitPoints = dialog.getByRole('group', { name: 'Hit points' });
  await expect(hitPoints).toContainText('The fixed value: 6 — this campaign’s rule.');
  await expect(hitPoints.getByRole('radio')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close' }).click();
  const inventory = await openCharacter(player, 'Inventory');
  await expect(inventory).toContainText(
    'More than you can carry: you drag it, at a Speed of 5 ft.',
  );
  await closeCharacter(player);
});

test('a Russian table sets and reads the campaign options in Russian', async ({ page }) => {
  test.setTimeout(90_000);
  // The campaign's language is the table's: the persona sign-in stays English.
  await enterWorld(page, TOKENS.dm, 'ui-campaign-options-ru');
  await openSheet(page, 'Сессия');
  await setOptions(page, {
    region: 'Параметры кампании',
    hitPoints: ['Хиты на новом уровне', 'Всегда фиксированные'],
    levels: ['Уровни', 'По вехам'],
    carrying: ['Переносимый вес', 'Учитывается'],
    start: 'Новые персонажи начинают с уровня',
    save: 'Сохранить параметры',
  });
  await openSheet(page, 'История');
  await expect(page.locator('#sheet-history')).toContainText(
    'Параметры кампании: хиты всегда фиксированные; уровни по вехам; вес учитывается; новые персонажи с уровня 3',
  );
  await openSheet(page, 'Отряд');
  await expect(page.getByRole('region', { name: 'Веха', exact: true })).toContainText(
    'Выдать уровень каждому',
  );
  await expectAccessible(page, 'the campaign options in Russian');
});
