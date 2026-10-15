import { expect, test, type Page } from '@playwright/test';

import { enterWorld, TOKENS } from './support/session.ts';
import { chooseLocation, openChronicle, openSheet } from './support/shell.ts';

/**
 * The Russian Ravenford in the browser (docs/adr/0031-play-language.md §10): a Russian
 * campaign shows Russian wording from the first screen to the last, and no English
 * sentence of the client or the engine appears. Each journey owns a campaign.
 */
const CAMPAIGNS = { player: 'ui-ru-player', dm: 'ui-ru-dm', chronicle: 'ui-ru-chronicle' } as const;

/** Words made only of Latin letters that the page may show: none beyond identifiers in markup. */
const ALLOWED = new Set<string>([]);

async function expectNoEnglish(page: Page, where: string): Promise<void> {
  const text = await page.locator('body').innerText();
  const words = (text.match(/[A-Za-z][A-Za-z'’-]{2,}/g) ?? []).filter(
    (word) => !ALLOWED.has(word.toLowerCase()),
  );
  expect(words, `${where}: English words on a Russian page`).toEqual([]);
}

test('a Russian player finds Mira, asks about the caravan, and reads only Russian', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.player, CAMPAIGNS.player);
  await expect(page.getByRole('heading', { level: 1, name: 'Пропавший караван' })).toBeVisible();
  await expect(page.getByLabel('Вид', { exact: true })).toBeVisible();
  await chooseLocation(page, 'market-square', { sheet: 'Места', label: 'Место' });
  await page.getByRole('button', { name: 'Мира Вейл', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Что вы хотите сделать?' })).toBeVisible();
  await expectNoEnglish(page, 'Mira selected');

  await page.getByRole('button', { name: 'Спросить: Караван Торговой гильдии' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Записано новое свидетельство.' }),
  ).toBeVisible();
  await expect(page.getByText('СВИДЕТЕЛЬСТВО').first()).toBeVisible();
  await expectNoEnglish(page, 'after asking');

  await page.getByRole('button', { name: 'Поговорить', exact: true }).click();
  // The browser-test server has no dialogue provider, so the honest answer is that no words came.
  await expect(
    page.getByText('Ответа вслух нет. Вы всё ещё можете спросить о теме.'),
  ).toBeVisible();
  await expectNoEnglish(page, 'after talking');
});

test('a Russian DM adds Tomas Reed from a Russian sentence, previews, edits, and confirms', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm, CAMPAIGNS.dm);
  await openSheet(page, 'Добавить в мир');
  await expect(page.getByText('Добавить в мир (мастер)', { exact: true })).toBeVisible();
  await page
    .getByLabel('Опишите, что добавить')
    .fill('Добавь: молодой стражник у Северных ворот, который видел, как ушёл караван.');
  await page.getByRole('button', { name: 'Предложить', exact: true }).click();
  const review = page.getByRole('region', { name: 'Предложение мастера' });
  await expect(review).toContainText('Томас Рид');
  await expect(review).toContainText('Создать (НПС): Томас Рид');
  await expectNoEnglish(page, 'preview');
  await page.getByRole('button', { name: 'Подтвердить и добавить в мир' }).click();
  await expect(page.getByText('Добавлено в мир.').first()).toBeVisible();
  await expectNoEnglish(page, 'committed');
});

/** Identifiers the page shows for what the player does not know by name (a creature's ID). */
const asIdentifier = /^(?:[a-z]+(?:-[a-z0-9]+)+|[A-Z]{1,3}\d?)$/;

async function expectNoEnglishExceptIds(page: Page, where: string): Promise<void> {
  const text = await page.locator('body').innerText();
  const words = (text.match(/[A-Za-z][A-Za-z0-9'’-]{2,}/g) ?? []).filter(
    (word) => !asIdentifier.test(word),
  );
  expect(words, `${where}: English words on a Russian page`).toEqual([]);
}

test('a Russian player answers a Counterspell window, and the answer is in Russian', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.player, 'ui-ru-combat');
  const prompt = page.getByRole('alertdialog', { name: 'Реакция' });
  await expect(prompt).toContainText('Заклинает: goblin-shaman');
  await expect(prompt).toContainText('Компоненты: В, С');
  await expect(page.getByRole('group', { name: 'Поле боя' })).toBeVisible();
  await expectNoEnglishExceptIds(page, 'reaction window');
  await prompt.getByRole('button', { name: 'Применить контрзаклинание' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: /Контрзаклинание остановило заклинание\.|Реакция использована\./ }),
  ).toBeVisible();
  await expectNoEnglishExceptIds(page, 'after the answer');
});

test('a Russian DM moves time and weather, and writes a chapter that reads in Russian', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm, 'ui-ru-time');
  await openSheet(page, 'Время и погода');
  await expect(page.getByText('Время и погода (мастер)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Перейти к дню 2, 10:00' }).click();
  await expect(page.getByLabel('Условия сцены')).toContainText('День 2 · 10:00');
  await page.getByLabel('Погода: Рыночная площадь').selectOption('rain');
  await page.getByRole('button', { name: 'Установить погоду' }).click();
  await expect(page.getByLabel('Условия сцены')).toContainText('дождь');
  await expectNoEnglish(page, 'time and weather');

  await openChronicle(page, 'Хроника');
  await page.getByText('Написать главу (мастер)', { exact: true }).click();
  await expect(page.getByLabel('Название')).toHaveValue('Глава I — Тени на Торговой дороге');
  await page.getByRole('button', { name: 'Написать главу', exact: true }).click();
  await expect(
    page.getByText('Глава записана простым перечнем событий: рассказчик был недоступен.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /Глава I/ })).toBeVisible();
  await expectNoEnglish(page, 'the written chapter');
});
