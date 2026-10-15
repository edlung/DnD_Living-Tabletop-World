import { mkdirSync, statSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { TOKENS } from '../e2e/support/session.ts';
import { closeSheet, openChronicle, openSheet } from '../e2e/support/shell.ts';

/**
 * Stage 320 part A evidence (docs/STAGE_320_DESIGN.md §9): sign-in, the scene for a player and
 * the DM, details (both), a conversation, the Chronicle, every sheet and the stage during an
 * encounter, at the three widths, in English and Russian, as JPEGs under
 * reports/evidence/stage-320/part-a/. A tour, not a journey: it asserts only that each screen is
 * showing. The test server has no image or dialogue provider, so places show the honest mist
 * and no spoken line arrives.
 */
const OUT = new URL('../../reports/evidence/stage-320/part-a/', import.meta.url).pathname;
const MAX_BYTES = 250 * 1024;
const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;
type Width = (typeof WIDTHS)[number]['name'];

const LANGUAGES = {
  en: {
    locale: 'en-US',
    player: 'ravenford',
    dm: 'ravenford',
    combat: 'ui-combat',
    campaign: 'Campaign',
    token: 'Access token',
    enter: 'Enter world',
    leave: 'Leave session',
    mira: 'Mira Vale',
    ask: 'Ask about Merchant Guild caravan',
    talk: 'Talk',
    closeDetails: 'Close details',
    noReply: 'No spoken reply is available. You can still ask about a subject.',
    places: 'Places',
    journal: 'Journal',
    chronicle: 'Chronicle',
    sheets: [
      ['add', 'Add to the world'],
      ['encounter', 'Encounter'],
      ['time', 'Time and weather'],
      ['history', 'History'],
    ],
  },
  ru: {
    locale: 'ru-RU',
    player: 'ui-ru-player',
    dm: 'ui-ru-dm',
    combat: 'ui-ru-combat',
    campaign: 'Кампания',
    token: 'Токен доступа',
    enter: 'Войти в мир',
    leave: 'Выйти из сессии',
    mira: 'Мира Вейл',
    ask: 'Спросить: Караван Торговой гильдии',
    talk: 'Поговорить',
    closeDetails: 'Закрыть подробности',
    noReply: 'Ответа вслух нет. Вы всё ещё можете спросить о теме.',
    places: 'Места',
    journal: 'Журнал',
    chronicle: 'Хроника',
    sheets: [
      ['add', 'Добавить в мир'],
      ['encounter', 'Схватка'],
      ['time', 'Время и погода'],
      ['history', 'История'],
    ],
  },
} as const;
type Words = (typeof LANGUAGES)[keyof typeof LANGUAGES];

/** One screen at each width (or the given ones), then back to the desktop size. */
async function shoot(
  page: Page,
  lang: string,
  screen: string,
  only: readonly Width[] = ['phone', 'tablet', 'desktop'],
): Promise<void> {
  for (const size of WIDTHS.filter((entry) => only.includes(entry.name))) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const path = `${OUT}${lang}-${screen}-${size.name}.jpg`;
    await page.screenshot({ path, type: 'jpeg', quality: 70, animations: 'disabled' });
    expect(statSync(path).size, `${path} is at most 250 KB`).toBeLessThanOrEqual(MAX_BYTES);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function signIn(page: Page, words: Words, token: string, campaign: string) {
  await page.getByLabel(words.campaign, { exact: true }).fill(campaign);
  await page.getByLabel(words.token, { exact: true }).fill(token);
  await page.getByRole('button', { name: words.enter, exact: true }).click();
  await expect(page.locator('nav.dock')).toBeVisible();
}

for (const [lang, words] of Object.entries(LANGUAGES)) {
  test(`stage 320 part A screens in ${lang}`, async ({ browser }) => {
    mkdirSync(OUT, { recursive: true });
    const context = await browser.newContext({
      locale: words.locale,
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByLabel(words.token, { exact: true })).toBeVisible();
    await shoot(page, lang, 'sign-in');

    // The player's scene, details and sheets.
    await signIn(page, words, TOKENS.player, words.player);
    const mira = page.getByRole('button', { name: words.mira, exact: true });
    await expect(mira).toBeVisible();
    await shoot(page, lang, 'scene-player');
    const details = page.locator('aside.detail-panel');
    await mira.click();
    await expect(details.getByRole('button', { name: words.talk, exact: true })).toBeVisible();
    await shoot(page, lang, 'details');
    await details.getByRole('button', { name: words.closeDetails }).click();
    for (const [screen, name] of [
      ['sheet-places', words.places],
      ['sheet-journal', words.journal],
    ] as const) {
      await openSheet(page, name);
      await shoot(page, lang, screen);
      await closeSheet(page, name);
    }

    // A conversation: what was learned as a typed record, the NPC in the scene's dialogue panel.
    await mira.click();
    await details.getByRole('button', { name: words.ask, exact: true }).click();
    await expect(page.locator('.discovered-knowledge')).toBeVisible();
    await details.getByRole('button', { name: words.talk, exact: true }).click();
    await expect(page.getByText(words.noReply)).toBeVisible();
    await expect(page.locator('.dialogue-panel')).toBeVisible();
    await shoot(page, lang, 'conversation', ['desktop']);
    await details.getByRole('button', { name: words.closeDetails }).click();
    await shoot(page, lang, 'conversation', ['phone', 'tablet']);

    await openChronicle(page, words.chronicle);
    await shoot(page, lang, 'chronicle');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.chronicle-dialog')).toBeHidden();

    // The DM's scene and tools.
    await page.getByRole('button', { name: words.leave, exact: true }).click();
    await signIn(page, words, TOKENS.dm, words.dm);
    await expect(mira).toBeVisible();
    await shoot(page, lang, 'scene-dm');
    await mira.click();
    await expect(details.locator('details.perform-npc')).toBeVisible();
    await shoot(page, lang, 'details-dm');
    await details.getByRole('button', { name: words.closeDetails }).click();
    for (const [screen, name] of words.sheets) {
      await openSheet(page, name);
      await shoot(page, lang, `sheet-${screen}`);
      await closeSheet(page, name);
    }

    // An encounter on the stage: the battlefield (part B redraws it), the summary beside it.
    await page.getByRole('button', { name: words.leave, exact: true }).click();
    await signIn(page, words, TOKENS.player, words.combat);
    await expect(page.locator('.combat-panel')).toBeVisible();
    await shoot(page, lang, 'battlefield');
    await context.close();
  });
}
