import { expect as baseExpect, test, type Page } from '@playwright/test';

import { enterWorld, TOKENS } from './support/session.ts';
import { dockButton, dockMore, expectDockFits, expectOnTop, openSheet } from './support/shell.ts';
import { SIGN_IN_CAMPAIGNS, SIGN_IN_ORIGIN, WORDS, joinAsDm } from './support/sign-in.ts';

/**
 * The dock fits every screen (docs/adr/0043-dm-screen.md §3): full words where they fit, short
 * words where they do not, and the last items under More where those do not fit either. It never
 * scrolls sideways, nothing covers it, and every tool stays in reach — the DM's fifteen with
 * invitations, in English and in Russian, from a wide laptop down to the narrowest phone.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const WIDTHS = [1440, 1280, 1180, 1024, 820, 768, 390, 320] as const;

const DM_EN = [
  ...['Scene', 'Places', 'Journal', 'Dice', 'Chronicle', 'Party', 'Encounter', 'Session'],
  ...['Table screen', 'Notes', 'Time and weather', 'Add to the world', 'Images', 'History'],
  'Players',
] as const;
const DM_RU = [
  ...['Сцена', 'Места', 'Журнал', 'Кубики', 'Хроника', 'Отряд', 'Схватка', 'Сессия'],
  ...['Экран стола', 'Заметки', 'Время и погода', 'Добавить в мир', 'Изображения', 'История'],
  'Игроки',
] as const;

/** At every width the dock fits, and every item is on it or under More, which opens and closes. */
async function fitsEverywhere(page: Page, names: readonly string[]): Promise<string[]> {
  const underMore: string[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectDockFits(page);
    for (const name of names) await expect(dockButton(page, name)).toBeAttached();
    const more = dockMore(page);
    if (!(await more.isVisible())) continue;
    await more.click();
    const list = page.locator('#dock-more-list');
    await expect(list).toBeVisible();
    for (const item of await list.getByRole('button').all()) await expectOnTop(item);
    underMore.push(`${String(width)}: ${String(await list.getByRole('button').count())}`);
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(more).toBeFocused();
  }
  return underMore;
}

test('the DM’s dock fits every width, its last tools under More', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ baseURL: SIGN_IN_ORIGIN, locale: 'en-US' });
  const dm = await context.newPage();
  await joinAsDm(dm, SIGN_IN_CAMPAIGNS.dock);
  const underMore = await fitsEverywhere(dm, DM_EN);
  // A wide laptop shows everything; a tablet in portrait and a phone keep the rest under More.
  expect(underMore.map((entry) => entry.split(':')[0])).not.toContain('1440');
  expect(underMore.map((entry) => entry.split(':')[0])).toContain('768');

  // A sheet opened from More marks More, and closing the sheet gives focus back to More.
  await dm.setViewportSize({ width: 768, height: 1024 });
  await openSheet(dm, 'Players');
  const more = dockMore(dm);
  await expect(more).toHaveClass(/is-current/);
  await dm
    .locator('#sheet-players')
    .getByRole('button', { name: /^Close/ })
    .click();
  await expect(more).toBeFocused();
  await expect(more).not.toHaveClass(/is-current/);
  await context.close();
});

test('in Russian the DM’s longer words fit too', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ baseURL: SIGN_IN_ORIGIN, locale: 'ru-RU' });
  const dm = await context.newPage();
  await joinAsDm(dm, SIGN_IN_CAMPAIGNS.dockRu, 0, WORDS.ru);
  await fitsEverywhere(dm, DM_RU);
  await context.close();
});

test('a player’s tab bar fits the narrowest phone', async ({ page }) => {
  await enterWorld(page, TOKENS.player);
  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 740 });
    await expectDockFits(page);
    for (const name of ['Scene', 'Places', 'Journal', 'Character', 'Dice', 'Chronicle']) {
      await expect(dockButton(page, name)).toBeAttached();
    }
  }
});
