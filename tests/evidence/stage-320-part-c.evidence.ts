import { mkdirSync, statSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { dmRequest } from '../e2e/support/authoring.ts';
import { TOKENS } from '../e2e/support/session.ts';
import { closeSheet, openSheet } from '../e2e/support/shell.ts';

/**
 * Stage 320 part C evidence (docs/STAGE_320_DESIGN.md §5.6–5.7, §9): the Chronicle as a book
 * and a flashback as a scene (the DM writes the chapter, the player reads it), the DM's tools
 * with something in them — a proposal card, the added NPC, the history with its undo preview,
 * time and weather, performing an NPC — and a conversation whose options live in one place,
 * at the three widths in English and Russian, as JPEGs under reports/evidence/stage-320/part-c/;
 * the book and the flashback also on a tablet turned on its side, where the book opens as a
 * spread on the desk (Stage 330: the GPT desk, ribbon and flashback frame).
 * A tour, not a journey: it asserts only that each screen is showing. Its servers are its own,
 * so it may act; the test server has no image, dialogue or narrator provider, so places show
 * the honest mist, NPCs no words and chapters the plain record.
 */
const OUT = new URL('../../reports/evidence/stage-320/part-c/', import.meta.url).pathname;
const MAX_BYTES = 250 * 1024;
const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;
type Width = (typeof WIDTHS)[number]['name'];
/** A tablet turned on its side: 1024 px and wider, the book opens as a spread on the desk. */
const LANDSCAPE = { name: 'tablet-landscape', width: 1180, height: 820 } as const;

const LANGUAGES = {
  en: {
    locale: 'en-US',
    book: 'ui-dm-book',
    tools: 'ui-dm-perform',
    player: 'ravenford',
    campaign: 'Campaign',
    token: 'Access token',
    enter: 'Enter world',
    leave: 'Leave session',
    chronicle: 'Chronicle',
    nextChapter: 'Chapter II — The Gate at Dusk',
    write: 'Write a chapter (DM)',
    toldFrom: 'Told from',
    writeChapter: 'Write chapter',
    openFlashback: 'Open flashback',
    add: 'Add to the world',
    describe: 'Describe what to add',
    request: 'Add a young guard near North Gate who saw the caravan leave.',
    propose: 'Propose',
    confirm: 'Confirm and add to the world',
    time: 'Time and weather',
    history: 'History',
    mira: 'Mira Vale',
    perform: 'Perform Mira Vale (DM)',
    line: 'What the character says (optional)',
    speak: 'Speak as Mira Vale',
    talk: 'Talk',
    closeDetails: 'Close details',
    goToConversation: 'Go to the conversation',
  },
  ru: {
    locale: 'ru-RU',
    book: 'ui-ru-chronicle',
    tools: 'ui-ru-dm',
    player: 'ui-ru-player',
    campaign: 'Кампания',
    token: 'Токен доступа',
    enter: 'Войти в мир',
    leave: 'Выйти из сессии',
    chronicle: 'Хроника',
    nextChapter: 'Глава II — Ворота в сумерках',
    write: 'Написать главу (мастер)',
    toldFrom: 'С чьей стороны',
    writeChapter: 'Написать главу',
    openFlashback: 'Открыть воспоминание',
    add: 'Добавить в мир',
    describe: 'Опишите, что добавить',
    request: 'Добавь: молодой стражник у Северных ворот, который видел, как ушёл караван.',
    propose: 'Предложить',
    confirm: 'Подтвердить и добавить в мир',
    time: 'Время и погода',
    history: 'История',
    mira: 'Мира Вейл',
    perform: 'Сыграть: Мира Вейл (мастер)',
    line: 'Что говорит персонаж (необязательно)',
    speak: 'Говорить за: Мира Вейл',
    talk: 'Поговорить',
    closeDetails: 'Закрыть подробности',
    goToConversation: 'Перейти к разговору',
  },
} as const;
type Words = (typeof LANGUAGES)[keyof typeof LANGUAGES];

/** One screen at one size: `<lang>-<screen>-<size>.jpg`. */
async function shootAt(
  page: Page,
  lang: string,
  screen: string,
  size: { readonly name: string; readonly width: number; readonly height: number },
): Promise<void> {
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.mouse.move(1, 1);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  const path = `${OUT}${lang}-${screen}-${size.name}.jpg`;
  await page.screenshot({ path, type: 'jpeg', quality: 70, animations: 'disabled' });
  expect(statSync(path).size, `${path} is at most 250 KB`).toBeLessThanOrEqual(MAX_BYTES);
}

/** One screen at each width (or the given ones), then back to the desktop size. */
async function shoot(
  page: Page,
  lang: string,
  screen: string,
  only: readonly Width[] = ['phone', 'tablet', 'desktop'],
): Promise<void> {
  for (const size of WIDTHS.filter((entry) => only.includes(entry.name))) {
    await shootAt(page, lang, screen, size);
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

const book = (page: Page) => page.locator('dialog.chronicle-dialog');

for (const [lang, words] of Object.entries(LANGUAGES)) {
  test(`stage 320 part C screens in ${lang}`, async ({ browser }) => {
    test.setTimeout(600_000);
    mkdirSync(OUT, { recursive: true });
    const context = await browser.newContext({
      locale: words.locale,
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    // The DM writes a chapter told from Elowen; the book opens on it.
    await signIn(page, words, TOKENS.dm, words.book);
    await page.locator('#dock-chronicle').click();
    await book(page).getByText(words.write, { exact: true }).click();
    await book(page)
      .getByLabel(words.toldFrom, { exact: true })
      .selectOption('CHARACTER:elowen-starwhisper');
    await book(page).getByRole('button', { name: words.writeChapter, exact: true }).click();
    await expect(book(page).locator('.book-chapter')).toBeVisible();
    await shoot(page, lang, 'book-dm', ['desktop']);
    // A second chapter, so the player's book has a ribbon for each: the one shown and another.
    const next = await dmRequest(page, words.book, 'post', 'chronicle', {
      title: words.nextChapter,
      perspective: 'CHARACTER:elowen-starwhisper',
      from: 0,
    });
    expect(next.body).toMatchObject({ result: { status: 'accepted' } });

    // The player reads it: the book, then a memory's flashback.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: words.leave, exact: true }).click();
    await signIn(page, words, TOKENS.player, words.book);
    await page.locator('#dock-chronicle').click();
    await expect(book(page).locator('.book-chapter')).toBeVisible();
    await expect(book(page).getByRole('button', { name: words.nextChapter })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await shoot(page, lang, 'book');
    await shootAt(page, lang, 'book', LANDSCAPE);
    await page.setViewportSize({ width: 1440, height: 900 });
    await book(page)
      .locator('.key-moments')
      .getByRole('button', { name: words.openFlashback })
      .first()
      .click();
    await expect(book(page).locator('.flashback-scene .flashback-line')).toBeVisible();
    await shoot(page, lang, 'flashback');
    await shootAt(page, lang, 'flashback', LANDSCAPE);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // A conversation: its options in one place; the selection's panel leads to it.
    await page.getByRole('button', { name: words.leave, exact: true }).click();
    await signIn(page, words, TOKENS.player, words.player);
    const details = page.locator('aside.detail-panel');
    await page.getByRole('button', { name: words.mira, exact: true }).click();
    await details.getByRole('button', { name: words.talk, exact: true }).click();
    await expect(page.locator('.dialogue-panel')).toBeVisible();
    await expect(details.locator('.conversation-note')).toBeVisible();
    await shoot(page, lang, 'conversation-once', ['desktop']);
    // Narrower, the panel covers the stage: "Go to the conversation" steps it aside.
    for (const size of ['phone', 'tablet'] as const) {
      const { width, height } = WIDTHS.find((entry) => entry.name === size) ?? WIDTHS[0];
      await page.setViewportSize({ width, height });
      if (!(await details.isVisible())) {
        await page.getByRole('button', { name: words.mira, exact: true }).click();
      }
      await details.getByRole('button', { name: words.goToConversation }).click();
      await expect(page.locator('.dialogue-panel')).toBeFocused();
      await shoot(page, lang, 'conversation-once', [size]);
    }

    // The DM's tools with something in them.
    await page.getByRole('button', { name: words.leave, exact: true }).click();
    await signIn(page, words, TOKENS.dm, words.tools);
    await openSheet(page, words.add);
    await page.getByLabel(words.describe, { exact: true }).fill(words.request);
    await page.getByRole('button', { name: words.propose, exact: true }).click();
    await expect(page.locator('.proposal-review')).toBeVisible();
    await shoot(page, lang, 'dm-add-proposal');
    await page.getByRole('button', { name: words.confirm, exact: true }).click();
    await expect(page.locator('.proposal-review--committed')).toBeVisible();
    await shoot(page, lang, 'dm-add-committed');
    await closeSheet(page, words.add);
    await openSheet(page, words.history);
    await expect(page.locator('.dm-history-entry').first()).toBeVisible();
    await shoot(page, lang, 'dm-history');
    await closeSheet(page, words.history);
    await openSheet(page, words.time);
    await expect(page.locator('.dm-world .tool-now').first()).toBeVisible();
    await shoot(page, lang, 'dm-time');
    await closeSheet(page, words.time);

    // Performing an NPC in the selection's panel.
    await page.getByRole('button', { name: words.mira, exact: true }).click();
    await details.getByText(words.perform, { exact: true }).click();
    await page.getByLabel(words.line).fill(lang === 'en' ? 'Good morning.' : 'Доброе утро.');
    // At each width the DM speaks again, so the answer comes into view where it appears.
    for (const size of WIDTHS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.getByRole('button', { name: words.speak }).click();
      await expect(details.locator('.perform-said')).toBeVisible();
      await shoot(page, lang, 'dm-perform', [size.name]);
    }
    await context.close();
  });
}
