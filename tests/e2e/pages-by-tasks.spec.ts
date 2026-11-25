import { expect, type Page } from '@playwright/test';

import { UI_RU_CAMPAIGNS } from '../../apps/server/src/testing/ui-ru-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { test } from './support/journey.ts';
import { TOKENS, enterWorld } from './support/session.ts';
import { bookPart, openSheet } from './support/shell.ts';

/**
 * The parts by tasks (docs/adr/0075-book-interface.md §18) on the Russian adventure: the
 * Session's page is the evening; the party's rest is beside its health; the tools an evening
 * rarely needs are the heroes' appendix; whose dice the table rolls and the campaign's options
 * are the table's settings. The evening's start offered from the Scene between sessions is read
 * where a campaign has no session yet (tests/e2e/dm-book-library.spec.ts).
 */
const LIVE = { timeout: 20_000 };
const sheet = (page: Page, id: string) => page.locator(`#sheet-${id}`);
const headings = (page: Page, id: string) =>
  sheet(page, id).getByRole('heading', { level: 3 }).allInnerTexts();

test('each page of the heroes and of the table holds its own tasks', async ({ page }) => {
  test.setTimeout(120_000);
  await enterWorld(page, TOKENS.dm, UI_RU_CAMPAIGNS.pages);
  await expect(bookPart(page, 'Сцена')).toHaveAttribute('aria-current', 'page', LIVE);

  // This adventure begins with its session open: the story's page offers no start of an evening
  // (a campaign between sessions does: tests/e2e/dm-book-library.spec.ts).
  const story = page.getByRole('region', { name: 'Рассказ: где сейчас отряд', exact: true });
  await expect(story).toBeVisible(LIVE);
  await expect(story.getByRole('note').filter({ hasText: 'Вечер ещё не начат.' })).toHaveCount(0);
  // The Session's page is the evening: the session that runs heads it, and the campaign's
  // options and the dice are not on it.
  await openSheet(page, 'Сессия');
  await expect(
    sheet(page, 'session').getByRole('button', { name: 'Поставить игру на паузу', exact: true }),
  ).toBeVisible(LIVE);
  await expect(sheet(page, 'session')).not.toContainText('Параметры кампании');
  await expect(
    sheet(page, 'session').getByRole('checkbox', { name: /Игроки бросают свои кубики/ }),
  ).toHaveCount(0);

  // The table's settings: whose dice the table rolls, and the campaign's options.
  await openSheet(page, 'Настройки');
  await expect(
    sheet(page, 'settings').getByRole('checkbox', {
      name: 'Игроки бросают свои кубики и вносят, что выпало',
    }),
  ).toBeVisible();
  await expect(sheet(page, 'settings')).toContainText('Параметры кампании');
  await expectAccessible(page, 'the table’s settings');

  // The party's page: its rest beside its health; the rare tools are not on it.
  await openSheet(page, 'Отряд');
  const party = await headings(page, 'party');
  expect(party).toContain('Отдых');
  expect(party).not.toContain('Ловушка');
  expect(party).not.toContain('Заразная болезнь');
  await sheet(page, 'party').getByRole('button', { name: 'Короткий отдых (1 час)' }).click();
  await expect(
    sheet(page, 'party').getByRole('button', { name: 'Закончить короткий отдых' }),
  ).toBeVisible(LIVE);
  await sheet(page, 'party').getByRole('button', { name: 'Закончить короткий отдых' }).click();
  await expect(
    sheet(page, 'party').getByRole('button', { name: 'Короткий отдых (1 час)' }),
  ).toBeVisible(LIVE);

  // The heroes' appendix: a trap, a mind under stress, a contagion, the days between adventures.
  await openSheet(page, 'Приложение');
  const appendix = await headings(page, 'appendix');
  for (const tool of ['Ловушка', 'Ментальный стресс', 'Заразная болезнь'])
    expect(appendix).toContain(tool);
  await expectAccessible(page, 'the heroes’ appendix');
});
