import { expect, type Locator, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { test } from './support/journey.ts';
import { INVESTIGATION_CAMPAIGNS } from './support/investigation.ts';
import { TOKENS, enterWorld } from './support/session.ts';
import { bookPart, chooseLocation, expectOnTop } from './support/shell.ts';

/**
 * The DM's working spread (docs/adr/0075-book-interface.md §16) on the Russian built-in adventure:
 * on a screen wide enough for two pages the Scene is the spread the game is run from — the story
 * where the party is on the left page; the plate, who and what is here and the DM's five seals on
 * the right. A seal opens what this page of the story prepares, then the whole tool; the card of
 * someone chosen takes the plate's place and begins with how the book tells them. Narrower, and
 * for a player, the Scene is as it was.
 */
// Each project runs its own campaign: the ribbon and a rest are the campaign's.
const campaign = () => (test.info().project.name === 'ipad' ? 'ui-ru-work-ipad' : 'ui-ru-work');
// The English adventure has no written book: its book is assembled from the world.
const assembled = () =>
  test.info().project.name === 'ipad'
    ? INVESTIGATION_CAMPAIGNS.workAssembledIpad
    : INVESTIGATION_CAMPAIGNS.workAssembled;
const LIVE = { timeout: 20_000 };

const story = (page: Page) =>
  page.getByRole('region', { name: 'Рассказ: где сейчас отряд', exact: true });
const seals = (page: Page) => page.getByRole('navigation', { name: 'Действия мастера' });
const seal = (page: Page, word: string) =>
  seals(page).getByRole('button', { name: word, exact: true });
const slip = (page: Page, word: string) => page.getByRole('dialog', { name: word, exact: true });
const scene = (page: Page) => page.getByRole('region', { name: 'Сцена', exact: true });
const card = (page: Page) => page.getByRole('complementary', { name: 'Подробности' });
const heading = (page: Page) => story(page).getByRole('heading', { level: 2 });
const onward = (page: Page) =>
  story(page).getByRole('button', { name: /^(Дальше|Следующая страница|Следующая глава)$/ });
const box = async (locator: Locator) => {
  const found = await locator.boundingBox();
  if (!found) throw new Error('not drawn');
  return found;
};

/** Turns the story on until the page with this title: a long text takes several screens. */
async function turnTo(page: Page, title: string) {
  for (let turns = 0; turns < 24 && (await heading(page).textContent()) !== title; turns += 1)
    await onward(page).click();
  await expect(heading(page)).toHaveText(title);
}

test('the DM runs the game from the Scene: the story, who is here and five seals', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await enterWorld(page, TOKENS.dm, campaign());
  await expect(bookPart(page, 'Сцена')).toHaveAttribute('aria-current', 'page', LIVE);

  // The left page is the story where the party is; the place stands on the right page.
  await expect(story(page)).toBeVisible(LIVE);
  await expect(heading(page)).toHaveText('Пропавший караван');
  await expect(story(page)).toContainText('Равенфорд стоит на перекрёстке трёх дорог');
  const left = await box(story(page));
  const here = await box(scene(page));
  expect(here.x).toBeGreaterThanOrEqual(left.x + left.width);
  const plate = await box(page.locator('.stage-backdrop'));
  expect(plate.y + plate.height).toBeLessThanOrEqual(here.y + 1);
  // The DM's actions are five seals at the page's foot, each with its word, none covered.
  for (const word of ['Бросок', 'Бой', 'Привал', 'На экран', 'Выдать'])
    await expectOnTop(seal(page, word));
  expect((await box(seals(page))).y).toBeGreaterThanOrEqual(here.y + here.height - 1);
  // The words read aloud are never cut at a line.
  const text = story(page).locator('.dmb-text:not(.dmb-measure)');
  const cut = await text.evaluate((element) => {
    // The lines themselves: a block's own padding under its last line is not a line.
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let lowest = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) lowest = Math.max(lowest, rect.bottom);
    }
    return lowest - element.getBoundingClientRect().bottom;
  });
  expect(cut).toBeLessThanOrEqual(1);
  // A name on a small plate is whole: none is cut at its last line.
  const cutNames = await scene(page)
    .locator('.name-plate > strong')
    .evaluateAll((names) =>
      names.filter((one) => one.scrollHeight > one.clientHeight + 1).map((one) => one.textContent),
    );
  expect(cutNames).toEqual([]);
  await expectAccessible(page, 'the DM’s working spread');

  // Someone chosen: their card takes the plate's place and begins with the book's telling; who
  // is here stays in reach under it.
  await scene(page).getByRole('button', { name: 'Мира Вейл', exact: true }).click();
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole('region', { name: 'По книге' })).toContainText(
    'Караван ушёл до рассвета.',
  );
  await expect
    .poll(async () => {
      const shown = await box(card(page));
      return shown.y + shown.height - (await box(scene(page))).y;
    })
    .toBeLessThanOrEqual(1);
  await expectOnTop(scene(page).getByRole('button', { name: 'Мира Вейл', exact: true }));
  await expectAccessible(page, 'the working spread with a card');
  await card(page).getByRole('button', { name: 'Закрыть подробности', exact: true }).click();
  await expect(card(page)).toBeHidden();

  // A seal says what this page prepares before it is pressed: here one fight, no handout.
  await expect(seal(page, 'Бой')).toHaveAccessibleDescription('Готово для этой страницы: 1');
  await expect(seal(page, 'Выдать')).toHaveAccessibleDescription('');
  // A fight: the chapter's own, said with why it cannot start here; the whole tool is one press on.
  await seal(page, 'Бой').click();
  await expect(slip(page, 'Бой')).toContainText('Засада на Старой Торговой дороге');
  await expectAccessible(page, 'the working spread with a seal’s slip');
  await page.keyboard.press('Escape');
  await expect(slip(page, 'Бой')).toBeHidden();
  await expect(seal(page, 'Бой')).toBeFocused();

  // A rest is called and ended from its seal.
  await seal(page, 'Привал').click();
  await slip(page, 'Привал').getByRole('button', { name: 'Короткий отдых (1 час)' }).click();
  await expect(slip(page, 'Привал')).toBeHidden();
  // Its result and a card share the plate's place: the result at its head, the card under it,
  // neither over the other's words or controls.
  const result = page.getByRole('status', { name: 'Результат действия' });
  await expect(result).toBeVisible(LIVE);
  await scene(page).getByRole('button', { name: 'Мира Вейл', exact: true }).click();
  await expect(card(page)).toBeVisible();
  await expect
    .poll(async () => {
      const told = await box(result);
      return (await box(card(page))).y - (told.y + told.height);
    })
    .toBeGreaterThanOrEqual(0);
  await expectOnTop(card(page).getByRole('button', { name: 'Закрыть подробности', exact: true }));
  await card(page).getByRole('button', { name: 'Закрыть подробности', exact: true }).click();
  await seal(page, 'Привал').click();
  const end = slip(page, 'Привал').getByRole('button', { name: 'Закончить короткий отдых' });
  await expect(end).toBeVisible(LIVE);
  await end.click();

  // Turning the story on moves the ribbon: the Book opens where the party is.
  await turnTo(page, 'Слух на рынке');
  await turnTo(page, 'Заброшенная стоянка');
  // This page's rolls are behind the seal, each asked of a hero from there.
  await expect(seal(page, 'Бросок')).toHaveAccessibleDescription(
    /^Готово для этой страницы: [1-9]$/,
  );
  await seal(page, 'Бросок').click();
  await expect(slip(page, 'Бросок')).toContainText('Колесо повозки');
  await expect(slip(page, 'Бросок')).toContainText('Интеллект · Анализ, Сл 13');
  await expect(
    slip(page, 'Бросок').getByRole('list', { name: 'Попросить бросок' }).first(),
  ).toBeVisible();
  await slip(page, 'Бросок').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await story(page).getByRole('button', { name: 'В книгу', exact: true }).click();
  const book = page.getByRole('region', { name: 'Пропавший караван', exact: true });
  await expect(book).toBeVisible();
  await expect(book.getByRole('article', { name: 'Текст', exact: true })).toContainText(
    'Заброшенная стоянка',
  );
  await expect(book.getByRole('article', { name: 'Текст', exact: true })).toContainText(
    'Отряд здесь',
  );
  await bookPart(page, 'Сцена').click();
  await expect(heading(page)).toHaveText('Заброшенная стоянка');

  // A seal leads to the whole tool: a handout of the DM's own is written on the Party's page.
  await seal(page, 'Выдать').click();
  await slip(page, 'Выдать').getByRole('button', { name: 'Написать свой материал' }).click();
  await expect(page.locator('#sheet-party')).toBeVisible();
  await bookPart(page, 'Сцена').click();

  // Held upright, a tablet has no room for two pages: the Scene is one page, the story the Book's.
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(story(page)).toHaveCount(0);
  await expect(seals(page)).toHaveCount(0);
  await expect(scene(page).getByRole('heading', { level: 2 })).toBeVisible();
});

/**
 * A campaign nobody wrote a book for (docs/adr/0075-book-interface.md §5): its book is assembled
 * from the world, a chapter a place. A page the campaign has no words for says so and lays out
 * what the book does hold of the place; when the Scene shows another place, the page offers the
 * chapter told there, and the DM turns to it.
 */
test('a book assembled from the world: a page with no words, and the chapter of another place', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const told = page.getByRole('region', { name: 'The story where the party is', exact: true });
  const title = told.getByRole('heading', { level: 2 });
  await enterWorld(page, TOKENS.dm, assembled());
  await expect(told).toBeVisible(LIVE);
  await expect(title).toHaveText('Market Square');
  // No words of the campaign's for this place: the page says so, and is not left blank.
  await expect(told).toContainText(
    'The campaign wrote no text for this page: tell it in your own words.',
  );
  const brief = told.getByRole('group', { name: 'Market Square', exact: true });
  await expect(brief).toContainText('Who is here by the book');
  await expect(brief).toContainText('Mira Vale — Merchant; friendly, practical, observant.');
  await expectAccessible(page, 'the working spread on a page with no words');
  // One person is one button on the spread: a name in the brief is a word, the plate opens the
  // card, and the card does not say twice what the world's own description says.
  await expect(brief.getByRole('button')).toHaveCount(0);
  await page
    .getByRole('region', { name: 'Scene', exact: true })
    .getByRole('button', { name: 'Mira Vale', exact: true })
    .click();
  const details = page.getByRole('complementary', { name: 'Entity details' });
  await expect(details).toContainText('Mira Vale');
  await expect(details.getByRole('region', { name: 'By the book' })).toHaveCount(0);
  await details.getByRole('button', { name: 'Close details', exact: true }).click();

  // The Scene shows another place: the page offers the chapter told there.
  await chooseLocation(page, 'golden-stag-inn');
  const offer = told.getByRole('note');
  await expect(offer).toContainText('“Golden Stag Inn”');
  await offer.getByRole('button', { name: 'Open that chapter', exact: true }).click();
  await expect(title).toHaveText('Golden Stag Inn');
  await expect(told.getByRole('note')).toHaveCount(0);
});

test('a player’s Scene has no story of the DM’s and no seals', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterWorld(page, TOKENS.player, campaign());
  await expect(scene(page)).toBeVisible(LIVE);
  await expect(scene(page)).toHaveAttribute('data-spread', '');
  await expect(story(page)).toHaveCount(0);
  await expect(seals(page)).toHaveCount(0);
  // The book's words are the DM's: none reaches a player's page.
  expect(await page.content()).not.toContain('Равенфорд стоит на перекрёстке трёх дорог');
});
