import { expect as baseExpect, type Page } from '@playwright/test';

import { bookPart, dockButton, expectOnTop, openSheet } from './support/shell.ts';
import { SIGN_IN_CAMPAIGNS, SIGN_IN_ORIGIN, WORDS, joinAsDm } from './support/sign-in.ts';
import { test } from './support/journey.ts';

/**
 * The DM's book is the DM's screen (docs/adr/0075-book-interface.md §3): seven parts at the
 * fore-edge, the open part's pages as tabs, every section the dock held one page of one part. At
 * every width every part is on screen and uncovered, every page opens through its part, and a
 * page that closes gives focus back to its tab.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const WIDTHS = [1440, 1180, 1024, 768, 390, 320] as const;

const PARTS_EN = ['Book', 'Scene', 'The heroes', 'World', 'Journal', 'At the table', 'Rules'];
const PAGES_EN = [
  ...['Book', 'Scene', 'Encounter', 'Party', 'Places', 'Time and weather', 'Add to the world'],
  ...['Images', 'Journal', 'Notes', 'Chronicle', 'History', 'Session', 'Chat', 'Table screen'],
  ...['Players', 'Rules', 'Dice'],
];
const PARTS_RU = ['Книга', 'Сцена', 'Герои', 'Мир', 'Журнал', 'За столом', 'Правила'];
const PAGES_RU = [
  ...['Книга', 'Сцена', 'Схватка', 'Отряд', 'Места', 'Время и погода', 'Добавить в мир'],
  ...['Изображения', 'Журнал', 'Заметки', 'Хроника', 'История', 'Сессия', 'Чат', 'Экран стола'],
  ...['Игроки', 'Правила', 'Кубики'],
];

async function fitsEverywhere(page: Page, parts: readonly string[], pages: readonly string[]) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 700 ? 800 : 900 });
    for (const name of parts) await expectOnTop(bookPart(page, name));
    for (const name of pages) await expect(dockButton(page, name)).toBeAttached();
    // The tabs of the open part never scroll the page sideways.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
  }
}

test('the DM’s parts and pages fit every width and every page opens through its part', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ baseURL: SIGN_IN_ORIGIN, locale: 'en-US' });
  const dm = await context.newPage();
  await joinAsDm(dm, SIGN_IN_CAMPAIGNS.dock);
  await expect(dm.locator('nav.dock')).toHaveCount(0);
  await fitsEverywhere(dm, PARTS_EN, PAGES_EN);

  await dm.setViewportSize({ width: 1180, height: 900 });
  for (const name of PAGES_EN.filter((page) => !['Scene', 'Chronicle', 'Book'].includes(page)))
    await openSheet(dm, name);
  // A part opens at the page last read in it: the Scene at Encounter, the World at Images.
  await bookPart(dm, 'Scene').click();
  await expect(dockButton(dm, 'Encounter')).toHaveAttribute('aria-expanded', 'true');
  await bookPart(dm, 'World').click();
  await expect(dockButton(dm, 'Images')).toHaveAttribute('aria-expanded', 'true');
  // A page closes back to the Scene, focus on the Scene's bookmark.
  await dm
    .locator('#sheet-images')
    .getByRole('button', { name: /^Close/ })
    .click();
  await expect(dockButton(dm, 'Scene')).toHaveAttribute('aria-pressed', 'true');
  await expect(bookPart(dm, 'Scene')).toBeFocused();
  await openSheet(dm, 'Players');
  await expect(dm.locator('#sheet-players')).toBeVisible();
  await expect(bookPart(dm, 'At the table')).toHaveAttribute('aria-current', 'page');
  await context.close();
});

test('in Russian the DM’s parts and pages fit too', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ baseURL: SIGN_IN_ORIGIN, locale: 'ru-RU' });
  const dm = await context.newPage();
  await joinAsDm(dm, SIGN_IN_CAMPAIGNS.dockRu, 0, WORDS.ru);
  await fitsEverywhere(dm, PARTS_RU, PAGES_RU);
  await context.close();
});
