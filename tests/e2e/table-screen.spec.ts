import { expect, test, type Locator, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { openSheet, openTopMenu } from './support/shell.ts';
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
 * The table's screen as the campaign's open book (docs/adr/0075-book-interface.md §19), on the
 * invitation-mode servers, where the table's screen lives: a login starts a library campaign that
 * has its own emblem, pairs a television, and a page with little to say is a spread — the emblem
 * the plate of the left page, the words on the right — never an empty sheet; a title page takes
 * the book's emblem, not the game's key art; words read aloud lie on the book's page under their
 * picture. The fight's column of turns is held by `display-room.spec.ts`. No trace or screenshot
 * is kept: the pages show links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const LIVE = { timeout: 90_000 };
const SOON = { timeout: 20_000 };
const SPACED_CODE = /^[A-HJKMNP-Z2-9]{4} [A-HJKMNP-Z2-9]{4}$/;
const TITLE = 'Маяк Между Ветрами';
const EMBLEM = '/book-materials/lighthouse/emblem.webp';
const TV = { width: 1920, height: 1080 };

async function startFromLibrary(dm: Page, title: string) {
  await openTopMenu(dm);
  await dm.getByRole('button', { name: /^(My campaigns|Мои кампании)$/ }).click();
  const library = dm.getByRole('region', { name: 'Campaigns from the library', exact: true });
  const look = library.getByRole('button', {
    name: `Look inside the book «${title}»`,
    exact: true,
  });
  await expect(look).toBeVisible(LIVE);
  await look.click();
  await dm
    .getByRole('dialog', { name: title, exact: true })
    .getByRole('button', { name: `Start «${title}»`, exact: true })
    .click();
  await expect(dm.locator('.session-shell h1')).toHaveText(title, LIVE);
  await expect(dm.locator('nav.book-parts')).toBeVisible(LIVE);
}

/** The DM chooses what the screens show, fills the choice's fields, and sends it. */
async function cast(
  dm: Page,
  kind: string,
  fill: (form: Locator) => Promise<void> = () => Promise.resolve(),
): Promise<void> {
  const form = dm.locator('#sheet-screen').getByRole('region', { name: 'Что показывают экраны' });
  await form.getByRole('radio', { name: kind, exact: true }).check();
  await fill(form);
  await form.getByRole('button', { name: 'Показать на экранах', exact: true }).click();
  await expect(form).toContainText(`Сейчас: ${kind}`, SOON);
}

const boxOf = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('nothing to measure');
  return box;
};

/** The emblem's layer of a quiet spread: its picture and its box (the left page). */
const plateOf = (section: Locator) =>
  section.evaluate((element) => {
    const layer = getComputedStyle(element, '::before');
    const box = element.getBoundingClientRect();
    return {
      picture: layer.backgroundImage,
      // The layer's own box, from its insets inside the section.
      right: box.right - Number.parseFloat(layer.right),
      left: box.left + Number.parseFloat(layer.left),
      middle: box.left + box.width / 2,
    };
  });

/** WCAG contrast of two `rgb()` colours as the browser computes them. */
const contrast = (one: string, other: string) => {
  const light = (colour: string) => {
    const [r = 0, g = 0, b = 0] = (colour.match(/[\d.]+/g) ?? []).map(Number);
    const channel = (value: number) => {
      const part = value / 255;
      return part <= 0.039_28 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const [high, low] = [light(one), light(other)].sort((a, b) => b - a);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
};

test('the table’s screen is the campaign’s open book', async ({ browser }) => {
  test.setTimeout(420_000);
  const words = WORDS.en;
  const dm = await freshPage(browser);
  await dm.goto(joinPath(dmToken(SIGN_IN_CAMPAIGNS.screenBook)));
  const invited = accessState(dm, words.invited);
  await invited.getByLabel('Your name at the table', { exact: true }).fill('Mira');
  await invited.getByLabel('Login', { exact: true }).fill('mira-screen');
  await invited.getByLabel('Password', { exact: true }).fill('a lantern over the harbour');
  await invited.getByRole('button', { name: words.takeSeat, exact: true }).click();
  await expect(dm.locator('nav.book-parts')).toBeVisible(LIVE);
  await startFromLibrary(dm, TITLE);

  const tv = await freshPage(browser, { viewport: TV });
  await tv.goto('/display');
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(SPACED_CODE, SOON);
  await openSheet(dm, 'Экран стола');
  const screens = dm.locator('#sheet-screen');
  await screens.getByLabel('Код экрана', { exact: true }).fill(await code.innerText());
  await screens.getByRole('button', { name: 'Подключить', exact: true }).click();
  const page = tv.locator('.display-cast');
  await expect(page).toBeVisible(LIVE);
  const middle = TV.width / 2;

  // No rolls yet: a spread, the book's own emblem the plate of the left page, the words on the
  // right one.
  await cast(dm, 'Броски за столом');
  const rolls = tv.getByRole('region', { name: 'Броски за столом', exact: true });
  const quiet = rolls.getByText('Бросков пока не было.', { exact: true });
  await expect(quiet).toBeVisible(SOON);
  await expect(page).toHaveAttribute('data-surface', 'paper');
  expect((await boxOf(quiet)).x).toBeGreaterThan(middle);
  const plate = await plateOf(rolls);
  expect(plate.picture).toContain(EMBLEM);
  expect(plate.left).toBeLessThan(middle);
  expect(Math.abs(plate.right - plate.middle)).toBeLessThan(2);
  await expectAccessible(tv, 'the table’s screen with no rolls yet');

  // A title page — the Chronicle with no chapter — takes the book's emblem, not the game's art.
  await cast(dm, 'Новую главу хроники');
  const empty = tv.getByRole('heading', { level: 1, name: 'Хроника пока пуста', exact: true });
  await expect(empty).toBeVisible(SOON);
  const emblem = tv.locator('.display-title img.display-emblem');
  await expect(emblem).toHaveAttribute('src', EMBLEM);
  await expect(tv.locator('.display-title img.display-art')).toHaveCount(0);
  const drawn = await boxOf(emblem);
  expect(drawn.x + drawn.width).toBeLessThan(middle);
  expect((await boxOf(empty)).x).toBeGreaterThan(middle);
  await expect(tv.locator('.display-title')).toContainText(TITLE);

  // A table not open to join: the same spread, the campaign's name on the right page.
  await cast(dm, 'QR-код для входа и «в прошлый раз»');
  const join = tv.getByRole('region', { name: 'Присоединиться к столу', exact: true });
  await expect(join).toContainText('Мастер ещё не открыл стол для входа.', SOON);
  const name = join.getByRole('heading', { level: 1, name: TITLE, exact: true });
  expect((await boxOf(name)).x).toBeGreaterThan(middle);
  expect((await plateOf(join)).picture).toContain(EMBLEM);

  // Words read aloud: the picture fills the page, the words lie on the book's paper at its foot
  // in the page's ink, and nothing runs off the screen.
  await cast(dm, 'Картинку со словами для чтения вслух', async (form) => {
    await form.getByLabel('Картинка', { exact: true }).selectOption({ label: 'Фонарная Гавань' });
    await form
      .getByLabel('Слова, которые читают вслух', { exact: true })
      .fill('Над медными крышами Фонарной Гавани поднимаются бумажные фонарики.');
  });
  const story = tv.getByRole('region', { name: 'История, которую читают вслух', exact: true });
  await expect(story.locator('p')).toHaveText(
    ['Над медными крышами Фонарной Гавани поднимаются бумажные фонарики.'],
    SOON,
  );
  const art = await boxOf(story.locator('img.display-story-art'));
  expect(art.width).toBeGreaterThan(TV.width * 0.95);
  const paper = await story.locator('.display-story-words').evaluate((element) => ({
    ink: getComputedStyle(element).color,
    ground: getComputedStyle(element, '::before').backgroundColor,
    veil: getComputedStyle(element.parentElement?.querySelector('.display-story-scrim') ?? element)
      .display,
  }));
  expect(paper.veil).toBe('none');
  expect(contrast(paper.ink, paper.ground)).toBeGreaterThan(7);
  expect(await tv.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(
    true,
  );
  await expectAccessible(tv, 'words read aloud on the book’s page');
});
