import { mkdirSync, statSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { clickWhereShown } from '../e2e/support/combat.ts';
import { TOKENS } from '../e2e/support/session.ts';
import { openSheet } from '../e2e/support/shell.ts';

/**
 * Stage 320 part B evidence (docs/STAGE_320_DESIGN.md §5.5, §9): the battlefield at the three
 * widths, tilted and flat, in English and Russian — the player's turn, a chosen target, a
 * movement route, a Fireball's previewed area with its ally warning, the reaction prompt over
 * the battlefield and over the scene, the DM's battlefield with the Encounter sheet, and the
 * DM acting for a player — as JPEGs under reports/evidence/stage-320/part-b/. A tour, not a
 * journey: it asserts only that each screen is showing. Each run has its own servers, so the
 * tour may act (a step, a reaction) in the campaigns it uses.
 */
const OUT = new URL('../../reports/evidence/stage-320/part-b/', import.meta.url).pathname;
const MAX_BYTES = 250 * 1024;
const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;
type Mode = 'tilted' | 'flat';

const LANGUAGES = {
  en: {
    locale: 'en-US',
    turn: 'ui-combat-turn',
    area: 'ui-combat-area',
    window: 'ui-combat',
    campaign: 'Campaign',
    token: 'Access token',
    enter: 'Enter world',
    leave: 'Leave session',
    flat: 'Flat board',
    tilted: 'Tilted board',
    square: (x: number, y: number) => new RegExp(`^Square ${String(x)}, ${String(y)}(:|$)`),
    moveHere: 'Move here',
    scene: 'Scene',
    battlefield: 'Battlefield',
    encounter: 'Encounter',
    actAs: 'Act as Elowen Starwhisper',
    absent: 'The player is absent',
    startActing: 'Start acting as Elowen Starwhisper',
    stopActing: 'Stop acting',
    reaction: 'Reaction',
  },
  ru: {
    locale: 'ru-RU',
    turn: 'ui-ru-combat-turn',
    area: 'ui-ru-combat-turn',
    window: 'ui-ru-combat',
    campaign: 'Кампания',
    token: 'Токен доступа',
    enter: 'Войти в мир',
    leave: 'Выйти из сессии',
    flat: 'Плоское поле',
    tilted: 'Наклонное поле',
    square: (x: number, y: number) => new RegExp(`^Клетка ${String(x)}, ${String(y)}(:|$)`),
    moveHere: 'Идти сюда',
    scene: 'Сцена',
    battlefield: 'Поле боя',
    encounter: 'Схватка',
    actAs: 'Действовать за персонажа: Эловен Старвиспер',
    absent: 'Игрока нет за столом',
    startActing: 'Начать действовать за персонажа: Эловен Старвиспер',
    stopActing: 'Перестать действовать',
    reaction: 'Реакция',
  },
} as const;
type Words = (typeof LANGUAGES)[keyof typeof LANGUAGES];

const board = (page: Page, words: Words) =>
  page.getByRole('group', { name: words.battlefield, exact: true });

async function setMode(page: Page, words: Words, mode: Mode): Promise<void> {
  const control = page.getByRole('button', { name: words[mode], exact: true });
  // A new width re-fits the board first; press until the view says it changed.
  await expect(async () => {
    if ((await control.getAttribute('aria-pressed')) !== 'true') await control.click();
    await expect(control).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

/** One state at each width and in each view of the board (none: the board is not shown). */
async function shoot(
  page: Page,
  words: Words,
  lang: string,
  state: string,
  modes: readonly Mode[] = ['tilted', 'flat'],
): Promise<void> {
  for (const size of WIDTHS) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(300);
    for (const mode of modes.length > 0 ? modes : [null]) {
      if (mode) await setMode(page, words, mode);
      // No tooltip of a pressed control in the picture.
      await page.mouse.move(1, 1);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(350);
      const name = modes.length > 1 && mode ? `${state}-${mode}` : state;
      const path = `${OUT}${lang}-${name}-${size.name}.jpg`;
      await page.screenshot({ path, type: 'jpeg', quality: 70, animations: 'disabled' });
      expect(statSync(path).size, `${path} is at most 250 KB`).toBeLessThanOrEqual(MAX_BYTES);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function signIn(page: Page, words: Words, token: string, campaign: string) {
  await page.goto('/');
  await page.getByLabel(words.campaign, { exact: true }).fill(campaign);
  await page.getByLabel(words.token, { exact: true }).fill(token);
  await page.getByRole('button', { name: words.enter, exact: true }).click();
  await expect(page.locator('nav.dock')).toBeVisible();
}

for (const [lang, words] of Object.entries(LANGUAGES)) {
  test(`stage 320 part B battlefield screens in ${lang}`, async ({ browser }) => {
    test.setTimeout(600_000);
    mkdirSync(OUT, { recursive: true });
    const context = await browser.newContext({
      locale: words.locale,
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    // The player's turn: the anchor, the active card with the own sheet, the tray.
    await signIn(page, words, TOKENS.player, words.turn);
    await expect(board(page, words)).toBeVisible();
    await expect(page.locator('.turn-tray')).toBeVisible();
    await shoot(page, words, lang, 'turn');

    // A chosen target: its card and options at the side, its buttons in the tray.
    await clickWhereShown(
      page,
      board(page, words).getByRole('button', { name: words.square(8, 4) }),
    );
    await expect(page.locator('.target-card .option-entry').first()).toBeVisible();
    await shoot(page, words, lang, 'target');

    // A chosen square: the advisory route as cyan squares and a dotted line.
    await board(page, words)
      .getByRole('button', { name: words.square(5, 7) })
      .click();
    await expect(page.locator('.board-path')).toBeVisible();
    await shoot(page, words, lang, 'move');

    // A Fireball's area: Elowen steps into it, then chooses the raider at its centre.
    await page.getByRole('button', { name: words.leave, exact: true }).click();
    await signIn(page, words, TOKENS.player, words.area);
    await board(page, words)
      .getByRole('button', { name: words.square(6, 5) })
      .click();
    await page.getByRole('button', { name: words.moveHere, exact: true }).click();
    await expect(
      board(page, words).getByRole('button', { name: words.square(6, 5) }),
    ).toHaveAttribute('aria-label', /Elowen|Эловен/);
    await clickWhereShown(
      page,
      board(page, words).getByRole('button', { name: words.square(8, 4) }),
    );
    await expect(page.locator('.board-square.in-area').first()).toBeVisible();
    await shoot(page, words, lang, 'area');

    // The reaction prompt over the battlefield, and over the scene.
    await page.getByRole('button', { name: words.leave, exact: true }).click();
    await signIn(page, words, TOKENS.player, words.window);
    await expect(page.getByRole('alertdialog', { name: words.reaction })).toBeVisible();
    await shoot(page, words, lang, 'reaction');
    await page.getByRole('tab', { name: words.scene, exact: true }).click();
    await shoot(page, words, lang, 'reaction-scene', []);
    await page.getByRole('tab', { name: words.battlefield, exact: true }).click();

    // The DM: every hit point and initiative, the Encounter sheet over the battlefield.
    await page.getByRole('button', { name: words.leave, exact: true }).click();
    await signIn(page, words, TOKENS.dm, words.turn);
    await expect(board(page, words)).toBeVisible();
    await shoot(page, words, lang, 'dm');
    // The sheet covers the board's controls on a phone: the board is tilted before it opens.
    await setMode(page, words, 'tilted');
    await openSheet(page, words.encounter);
    await shoot(page, words, lang, 'dm-encounter', []);

    // The DM acting for an absent player: the acting bar across the top of the stage.
    await page.getByRole('button', { name: words.actAs }).click();
    await page.getByLabel(words.absent).check();
    await page.getByRole('button', { name: words.startActing }).click();
    // Acting switches to her perspective: the screen starts afresh, with no DM sheet open.
    await expect(page.getByRole('button', { name: words.stopActing })).toBeVisible();
    await expect(board(page, words)).toBeVisible();
    await shoot(page, words, lang, 'acting');
    await context.close();
  });
}
