import { expect, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { test } from './support/journey.ts';
import { TOKENS, enterWorld } from './support/session.ts';

/**
 * The DM's book (docs/adr/0074-dm-book.md §3) on the Russian built-in adventure: the DM reads the
 * story page by page, opens a person and a check from the text, keeps the ribbon where the party
 * is while reading ahead, goes to a section by a bookmark and comes back to the same page; a
 * player has no book and cannot read it. The book changes nothing in the world.
 */
const CAMPAIGN = 'ui-ru-book';
const LIVE = { timeout: 20_000 };

async function openBook(page: Page) {
  await enterWorld(page, TOKENS.dm, CAMPAIGN);
  const dock = page.locator('nav.dock');
  await expect(dock).toBeVisible(LIVE);
  const book = page.getByRole('region', { name: 'Пропавший караван', exact: true });
  // The tab remembers an open section: the book may be open already.
  const button = dock.getByRole('button', { name: 'Книга', exact: true });
  await expect(button).toBeVisible(LIVE);
  if (!(await book.isVisible())) await button.click();
  await expect(book).toBeVisible(LIVE);
  return book;
}
const story = (page: Page) => page.getByRole('article', { name: 'Текст', exact: true });
const side = (page: Page) => page.getByRole('complementary', { name: 'Правая страница' });
const heading = (page: Page) => story(page).getByRole('heading', { level: 3 });
const onward = (page: Page) =>
  story(page).getByRole('button', { name: /^(Дальше|Следующая страница|Следующая глава)$/ });

/** Turns on until the page with this title: a long text takes several screens of one page. */
async function turnTo(page: Page, title: string) {
  for (let turns = 0; turns < 8 && (await heading(page).textContent()) !== title; turns += 1)
    await onward(page).click();
  await expect(heading(page)).toHaveText(title);
}

/** Presses words of the text that open a moment, reading on to the screen that holds them. */
async function openFromText(page: Page, words: string) {
  const link = story(page).getByRole('button', { name: words, exact: true });
  for (let turns = 0; turns < 6 && (await link.count()) === 0; turns += 1)
    await onward(page).click();
  await link.click();
  return link;
}

test('the DM reads the book, opens its moments and keeps the party’s place', async ({ page }) => {
  test.setTimeout(120_000);
  const book = await openBook(page);

  // The chapter opens with its words to read aloud; the right page says what it is for.
  await expect(heading(page)).toHaveText('Пропавший караван');
  await expect(story(page)).toContainText('Равенфорд встречает вас шумом Рыночной площади');
  await expect(side(page)).toContainText('Зачем эта глава');
  await expect(story(page)).toContainText('Отряд здесь');
  await expectAccessible(page, 'the book at a chapter’s opening');

  // Turning the page moves the ribbon with it.
  await turnTo(page, 'Слух на рынке');
  await expect(story(page)).toContainText('Страница 1 из 6');
  await expect(story(page)).toContainText('Закладка перешла сюда');

  // A name in the text opens the person's moment on the right page; "back" returns to the link.
  const mira = await openFromText(page, 'Мира Вейл');
  await expect(side(page).getByRole('heading', { level: 3 })).toContainText('Разговор с Мирой');
  await expect(side(page)).toContainText('Караван ушёл до рассвета');
  await expectAccessible(page, 'the book with a card open');
  await side(page).getByRole('button', { name: 'Закрыть карточку' }).click();
  await expect(side(page)).toContainText('Спросите игроков');
  await expect(mira).toBeFocused();

  // A check of the next page shows its skill and difficulty as fields.
  await turnTo(page, 'Заброшенная стоянка');
  // The turn that moved the ribbon can be taken back, and the ribbon laid again by hand.
  await story(page).getByRole('button', { name: 'Вернуть закладку' }).click();
  await expect(story(page)).toContainText('Закладка: Слух на рынке');
  await expect(heading(page)).toBeFocused();
  await story(page).getByRole('button', { name: 'Закладку сюда' }).click();
  await expect(story(page)).toContainText('Отряд здесь');
  await openFromText(page, 'странный знак');
  await expect(side(page)).toContainText('Анализ, Сл 14');
  await side(page).getByRole('button', { name: 'Закрыть карточку' }).click();

  // Reading back and ahead again leaves the ribbon on the page the party reached.
  for (
    let turns = 0;
    turns < 6 && (await heading(page).textContent()) !== 'Слух на рынке';
    turns += 1
  )
    await story(page).getByRole('button', { name: 'Назад' }).click();
  await expect(heading(page)).toHaveText('Слух на рынке');
  await expect(story(page)).toContainText('Закладка: Заброшенная стоянка');
  await story(page).getByRole('button', { name: 'К закладке' }).click();
  await expect(heading(page)).toHaveText('Заброшенная стоянка');

  // The path: where the party is, and any chapter can be read.
  await book.getByRole('button', { name: 'Оглавление', exact: true }).click();
  const path = page.getByRole('region', { name: 'Оглавление', exact: true });
  await expect(path.getByRole('listitem')).toHaveCount(1);
  await expect(path.getByRole('listitem').first()).toContainText('Отряд здесь');
  await expectAccessible(page, 'the path through the chapters');
  await book.getByRole('button', { name: 'Страницы', exact: true }).click();

  // A bookmark opens a section of the dock; closing it comes back to the same page.
  await book.getByRole('button', { name: 'Отряд', exact: true }).click();
  const party = page.locator('#sheet-party');
  await expect(party).toBeVisible();
  await party.getByRole('button', { name: /^Закрыть/ }).click();
  await expect(heading(page)).toHaveText('Заброшенная стоянка');

  // The place is kept for the DM: entering again, the book opens where the ribbon lies.
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/campaigns/${CAMPAIGN}/dm/book`, {
        headers: { authorization: `Bearer ${TOKENS.dm}` },
      });
      return ((await response.json()) as { book: { place: { ribbon: string } } }).book.place.ribbon;
    }, LIVE)
    .toBe('ravenford-site');
  await openBook(page);
  await expect(heading(page)).toHaveText('Заброшенная стоянка', LIVE);
});

test('a player has no book and cannot read the DM’s', async ({ page }) => {
  await enterWorld(page, TOKENS.player, CAMPAIGN);
  const dock = page.locator('nav.dock');
  await expect(dock).toBeVisible(LIVE);
  await expect(dock.getByRole('button', { name: 'Книга', exact: true })).toHaveCount(0);
  for (const token of [TOKENS.player, TOKENS.outsider]) {
    const read = await page.request.get(`/api/campaigns/${CAMPAIGN}/dm/book`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(read.status()).toBe(404);
    expect(await read.text()).not.toContain('Мира');
  }
  expect((await page.request.get(`/api/campaigns/${CAMPAIGN}/dm/book`)).status()).toBe(401);
});
