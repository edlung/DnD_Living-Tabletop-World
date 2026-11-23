import { expect, test, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { bookPart } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
  accessState,
  dmToken,
  joinPath,
} from './support/sign-in.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * The DM's book of a library campaign (docs/adr/0074-dm-book.md §3): a login starts a family
 * campaign and a collection campaign from the hub, and each opens as a book — its chapters on the
 * path, a scene as a page with the people it names and its check, the campaign's own look. No
 * trace or screenshot is kept: the pages show links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const LIVE = { timeout: 90_000 };

async function startFromLibrary(dm: Page, title: string) {
  await dm.getByRole('button', { name: /^(My campaigns|Мои кампании)$/ }).click();
  const library = dm.getByRole('region', { name: 'Campaigns from the library', exact: true });
  const start = library.getByRole('button', { name: `Start «${title}»`, exact: true });
  await expect(start).toBeVisible(LIVE);
  await start.click();
  await expect(dm.locator('.session-shell h1')).toHaveText(title, LIVE);
  await expect(dm.locator('nav.book-parts')).toBeVisible(LIVE);
}

/** Turns on from a chapter's opening to its first page: long words take several screens. */
async function toFirstPage(dm: Page) {
  const story = dm.getByRole('article', { name: 'Текст', exact: true });
  const onward = story.getByRole('button', { name: /^(Дальше|Следующая страница)$/ });
  for (
    let turns = 0;
    turns < 8 && !/Страница 1 из/.test((await story.textContent()) ?? '');
    turns += 1
  )
    await onward.click();
  await expect(story).toContainText(/Страница 1 из \d+/);
}

async function openBook(dm: Page, title: string) {
  const button = bookPart(dm, 'Книга');
  await expect(button).toBeVisible(LIVE);
  const book = dm.getByRole('region', { name: title, exact: true });
  // The tab remembers an open section: the book may be open already.
  if (!(await book.isVisible())) await button.click();
  await expect(book).toBeVisible();
  return book;
}

test('a family campaign and a collection campaign of the library open as books', async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const words = WORDS.en;
  const dm = await freshPage(browser);
  await dm.goto(joinPath(dmToken(SIGN_IN_CAMPAIGNS.bookLibrary)));
  const invited = accessState(dm, words.invited);
  await invited.getByLabel('Your name at the table', { exact: true }).fill('Mira');
  await invited.getByLabel('Login', { exact: true }).fill('mira-book');
  await invited.getByLabel('Password', { exact: true }).fill('a ribbon between pages');
  await invited.getByRole('button', { name: words.takeSeat, exact: true }).click();
  await expect(dm.locator('nav.book-parts')).toBeVisible(LIVE);

  // A family campaign: twelve chapters, a free order the campaign states in its own words.
  await startFromLibrary(dm, 'Маяк Между Ветрами');
  const lighthouse = await openBook(dm, 'Маяк Между Ветрами');
  const story = dm.getByRole('article', { name: 'Текст', exact: true });
  const side = dm.getByRole('complementary', { name: 'Правая страница' });
  await expect(story).toContainText('Глава 1');
  await expect(story).toContainText('Прочитайте вслух');
  await expect(side).toContainText('Зачем эта глава');
  await expectAccessible(dm, 'a library campaign’s book at its first chapter');
  // The book is dressed in its own campaign's set (docs/adr/0075-book-interface.md §1.8).
  await expect(
    lighthouse.getByRole('button', { name: 'Страницы', exact: true }).locator('img'),
  ).toHaveAttribute('src', '/book-materials/lighthouse/part-story.webp');
  // A campaign's handout is given from its card as any handout is: the players can read it.
  await side
    .getByRole('button', { name: /Материал$/ })
    .first()
    .click();
  await side.getByRole('button', { name: 'Выдать отряду' }).click();
  await expect(side).toContainText('Выдано: каждый игрок может прочитать.');
  await side.getByRole('button', { name: 'Закрыть карточку' }).click();
  // The chapter's picture goes to the table's screen on the DM's press, with the words read
  // aloud when they fit; the screens' own route takes it.
  await side.getByRole('button', { name: 'Показать на экране стола' }).click();
  await expect(side).toContainText('Экран стола показывает это.');
  await lighthouse.getByRole('button', { name: 'Оглавление', exact: true }).click();
  const path = dm.getByRole('region', { name: 'Оглавление', exact: true });
  await expect(path.getByRole('listitem')).toHaveCount(12);
  await expect(path).toContainText('Острова 3–8 можно посещать в другом порядке');
  await expect(path.getByRole('listitem').nth(0)).toContainText('Отряд здесь');
  await expect(path.getByRole('listitem').nth(1)).toContainText('Следующая по книге');
  // Any chapter opens, and reading it leaves the ribbon where the party is.
  await path.getByRole('button', { name: /^Читать главу 5:/ }).click();
  await expect(story).toContainText('Глава 5');
  await expect(story).toContainText('Закладка: глава 1');
  // A scene is a page: its check, what the players may choose, the people its text names.
  await toFirstPage(dm);
  await expect(side).toContainText('Бросок');
  await expect(side).toContainText('Что могут выбрать игроки');
  await expectAccessible(dm, 'a scene of a library campaign as a page');

  // A collection campaign: its own book, its own look.
  await startFromLibrary(dm, 'Завещание Пепла');
  await expect(dm.locator('.session-shell')).toHaveAttribute(
    'data-campaign-theme',
    'ash-testament',
  );
  await openBook(dm, 'Завещание Пепла');
  await expect(story).toContainText('Глава 1');
  await expect(side).toContainText('Зачем эта глава');
  await toFirstPage(dm);
  // A scene opens with words to read aloud, quoted before the DM's own text.
  await expect(story).toContainText('Цитату прочитайте вслух, остальное — для мастера');
  await expect(story.locator('blockquote').first()).toBeVisible();
  await expect(side).toContainText('Люди и события');
  // The DM's pocket is folded on every page: rumours with what is behind them.
  await side.getByText('Карман мастера', { exact: true }).click();
  await expect(side).toContainText('Слухи');
  await expect(side).toContainText('Прохожие');
  await expectAccessible(dm, 'a scene page with its words to read aloud and the open pocket');
});
