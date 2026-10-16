import { mkdirSync, statSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import campaigns from '../e2e/fixtures/image-campaigns.json' with { type: 'json' };
import { TOKENS } from '../e2e/support/session.ts';
import { closeSheet, openSheet } from '../e2e/support/shell.ts';

/**
 * Stage 330 part B evidence (docs/STAGE_330_DESIGN.md "DM controls", "Evidence"): the curated
 * GPT pictures in the client at the three widths, in English and Russian — the player's scene
 * (the place's approved picture, figures standing), a conversation, the battlefield tilted and
 * flat (figures on the Old Trade Road's battle map), an investigation object's picture in its
 * panel, and the DM's image controls (an entity's images with a candidate, a request being
 * generated, a failed one; the Images sheet) — as JPEGs under
 * reports/evidence/stage-330/part-b/. A tour, not a journey: it asserts only that each screen is
 * showing. Every picture shown is GPT-made: the review campaigns' candidates are curated
 * pictures not yet approved; no placeholder picture appears. Each run has its own servers, so
 * the tour may act (asking Mira) in the campaigns it uses.
 */
const OUT = new URL('../../reports/evidence/stage-330/part-b/', import.meta.url).pathname;
const MAX_BYTES = 250 * 1024;
const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;
type Width = (typeof WIDTHS)[number]['name'];
type Mode = 'tilted' | 'flat';

const LANGUAGES = {
  en: {
    locale: 'en-US',
    review: campaigns.review,
    battle: campaigns.battle,
    site: campaigns.site,
    campaign: 'Campaign',
    token: 'Access token',
    enter: 'Enter world',
    leave: 'Leave session',
    mira: 'Mira Vale',
    ask: 'Ask about Merchant Guild caravan',
    talk: 'Talk',
    closeDetails: 'Close details',
    noReply: 'No spoken reply is available. You can still ask about a subject.',
    item: 'Unidentified item',
    flat: 'Flat board',
    tilted: 'Tilted board',
    battlefield: 'Battlefield',
    images: 'Images',
    showGate: 'Show North Gate',
    showThorne: 'Show Captain Thorne',
    region: 'Images (DM)',
  },
  ru: {
    locale: 'ru-RU',
    review: campaigns.reviewRu,
    battle: campaigns.battleRu,
    site: campaigns.siteRu,
    campaign: 'Кампания',
    token: 'Токен доступа',
    enter: 'Войти в мир',
    leave: 'Выйти из сессии',
    mira: 'Мира Вейл',
    ask: 'Спросить: Караван Торговой гильдии',
    talk: 'Поговорить',
    closeDetails: 'Закрыть подробности',
    noReply: 'Ответа вслух нет. Вы всё ещё можете спросить о теме.',
    item: 'Неопознанный объект (предмет)',
    flat: 'Плоское поле',
    tilted: 'Наклонное поле',
    battlefield: 'Поле боя',
    images: 'Изображения',
    showGate: 'Показать: Северные ворота',
    showThorne: 'Показать: Капитан Торн',
    region: 'Изображения (мастер)',
  },
} as const;
type Words = (typeof LANGUAGES)[keyof typeof LANGUAGES];

/** Every picture on the page has arrived, so none is caught half-loaded. */
async function picturesLoaded(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.images]
          .filter((image) => image.src.startsWith('blob:') && image.checkVisibility())
          .every((image) => image.complete && image.naturalWidth > 0),
      ),
    )
    .toBe(true);
}

async function setMode(page: Page, words: Words, mode: Mode): Promise<void> {
  const control = page.getByRole('button', { name: words[mode], exact: true });
  // A new width re-fits the board first; press until the view says it changed.
  await expect(async () => {
    if ((await control.getAttribute('aria-pressed')) !== 'true') await control.click();
    await expect(control).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

/** One screen at each width (or the given ones) and board view, then back to the desktop size. */
async function shoot(
  page: Page,
  words: Words,
  lang: string,
  screen: string,
  options: {
    readonly only?: readonly Width[];
    readonly modes?: readonly Mode[];
    readonly before?: () => Promise<void>;
  } = {},
): Promise<void> {
  const only = options.only ?? ['phone', 'tablet', 'desktop'];
  for (const size of WIDTHS.filter((entry) => only.includes(entry.name))) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(300);
    for (const mode of options.modes ?? [null]) {
      if (mode) await setMode(page, words, mode);
      await options.before?.();
      // No tooltip of a pressed control in the picture.
      await page.mouse.move(1, 1);
      await page.evaluate(() => document.fonts.ready);
      await picturesLoaded(page);
      await page.waitForTimeout(350);
      const path = `${OUT}${lang}-${screen}${mode ? `-${mode}` : ''}-${size.name}.jpg`;
      await page.screenshot({ path, type: 'jpeg', quality: 62, animations: 'disabled' });
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
  test(`stage 330 part B picture screens in ${lang}`, async ({ browser }) => {
    test.setTimeout(600_000);
    mkdirSync(OUT, { recursive: true });
    const context = await browser.newContext({
      locale: words.locale,
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const details = page.locator('aside.detail-panel');

    // The player's scene: Market Square's approved picture, Elowen and Mira standing.
    await signIn(page, words, TOKENS.player, words.review);
    const mira = page.getByRole('button', { name: words.mira, exact: true });
    await expect(mira.locator('.miniature-art')).toBeVisible();
    await shoot(page, words, lang, 'scene');

    // A conversation: Mira's approved portrait in the dialogue panel, what was learned.
    await mira.click();
    await details.getByRole('button', { name: words.ask, exact: true }).click();
    await expect(page.locator('.discovered-knowledge')).toBeVisible();
    await details.getByRole('button', { name: words.talk, exact: true }).click();
    await expect(page.getByText(words.noReply)).toBeVisible();
    await expect(page.locator('.dialogue-panel')).toBeVisible();
    await shoot(page, words, lang, 'conversation', { only: ['desktop'] });
    await details.getByRole('button', { name: words.closeDetails }).click();
    await shoot(page, words, lang, 'conversation', { only: ['phone', 'tablet'] });

    // The battlefield on the Old Trade Road's battle map, the figures tilted and flat.
    await page.getByRole('button', { name: words.leave, exact: true }).click();
    await signIn(page, words, TOKENS.player, words.battle);
    const board = page.getByRole('group', { name: words.battlefield, exact: true });
    await expect(board).toBeVisible();
    await expect(page.locator('.board-map')).toBeVisible();
    await shoot(page, words, lang, 'battlefield', { modes: ['tilted', 'flat'] });

    // An investigation object's approved picture in its panel.
    await page.getByRole('button', { name: words.leave, exact: true }).click();
    await signIn(page, words, TOKENS.player, words.site);
    await page.getByRole('button', { name: words.item, exact: true }).first().click();
    await expect(details.locator('.details-plate img')).toBeVisible();
    await shoot(page, words, lang, 'object');

    // The DM's image controls: the Images sheet, North Gate's and Captain Thorne's images.
    await page.getByRole('button', { name: words.leave, exact: true }).click();
    await signIn(page, words, TOKENS.dm, words.review);
    await openSheet(page, words.images);
    const sheet = page.locator('#sheet-images');
    await expect(sheet.locator('.image-card--candidate')).toHaveCount(2);
    await shoot(page, words, lang, 'dm-images-sheet');
    await sheet.getByRole('button', { name: words.showGate, exact: true }).click();
    const images = details.getByRole('region', { name: words.region, exact: true });
    await expect(images.locator('.image-card--candidate')).toHaveCount(1);
    const toCandidates = async () => {
      await images.locator('.image-card--candidate').scrollIntoViewIfNeeded();
    };
    await shoot(page, words, lang, 'dm-images-place', { before: toCandidates });
    await openSheet(page, words.images);
    await sheet.getByRole('button', { name: words.showThorne, exact: true }).click();
    await expect(images.locator('.image-card--candidate')).toHaveCount(1);
    await shoot(page, words, lang, 'dm-images-figure', { before: toCandidates });
    await closeSheet(page, words.images);
    await context.close();
  });
}
