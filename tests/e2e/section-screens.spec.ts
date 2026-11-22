import { expect, test, type Page } from '@playwright/test';

import { enterWorld, TOKENS } from './support/session.ts';
import { dockButton, expectOnTop, openSheet } from './support/shell.ts';

/**
 * A dock section takes the whole stage (work-orders/FULLSCREEN_SECTIONS_2026-11-21.md): from under
 * the top bar to the window's foot, the dock in reach over it; it closes by its Close button, by
 * Escape and by its own dock button, and focus comes back to that button. Its content is laid
 * out across the width, so Places and the Journal need no scrolling of the section on a laptop.
 */
const sheetOf = (page: Page, id: string) => page.locator(`#sheet-${id}`);

/** How far the section's edges are from the stage's: nothing of the scene shows beside it. */
async function offStage(page: Page, id: string): Promise<number> {
  return sheetOf(page, id).evaluate((sheet) => {
    const stage = sheet.closest('.stage');
    if (!stage) return Number.POSITIVE_INFINITY;
    const a = sheet.getBoundingClientRect();
    const b = stage.getBoundingClientRect();
    return Math.max(
      Math.abs(a.left - b.left),
      Math.abs(a.top - b.top),
      Math.abs(a.right - b.right),
      Math.abs(a.bottom - b.bottom),
    );
  });
}

test('a section takes the whole stage and closes three ways', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterWorld(page, TOKENS.dm);
  for (const [name, id] of [
    ['Places', 'places'],
    ['Journal', 'journal'],
    ['Dice', 'dice'],
    ['Party', 'party'],
    ['Session', 'session'],
  ] as const) {
    await openSheet(page, name);
    // (Once it has risen: it opens with a short rise of a few pixels.)
    await expect.poll(() => offStage(page, id), `${name} fills the stage`).toBeLessThanOrEqual(1);
    // The dock stays in reach over the section, and the section's Close is never covered.
    await expectOnTop(dockButton(page, name));
    const close = sheetOf(page, id).getByRole('button', { name: /^Close/ });
    await expectOnTop(close);
    await close.click();
    await expect(sheetOf(page, id)).toBeHidden();
    await expect(dockButton(page, name)).toBeFocused();
  }

  await openSheet(page, 'Journal');
  await page.keyboard.press('Escape');
  await expect(sheetOf(page, 'journal')).toBeHidden();
  await expect(dockButton(page, 'Journal')).toBeFocused();

  await openSheet(page, 'Places');
  await dockButton(page, 'Places').click();
  await expect(sheetOf(page, 'places')).toBeHidden();

  // Scene, the dock's first item, is the way back from any section too.
  await openSheet(page, 'Dice');
  await dockButton(page, 'Scene').click();
  await expect(sheetOf(page, 'dice')).toBeHidden();
});

test('Places and the Journal fit a laptop and an iPad without scrolling the section', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(size);
    for (const [name, id] of [
      ['Places', 'places'],
      ['Journal', 'journal'],
    ] as const) {
      await openSheet(page, name);
      const body = sheetOf(page, id).locator('.sheet-body');
      await expect
        .poll(() => body.evaluate((element) => element.scrollHeight - element.clientHeight))
        .toBeLessThanOrEqual(1);
      // Nothing scrolls the page sideways either.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0);
      await sheetOf(page, id)
        .getByRole('button', { name: /^Close/ })
        .click();
    }
  }
});

test('the Journal finds what is known by name and by kind', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterWorld(page, TOKENS.dm);
  await openSheet(page, 'Journal');
  const known = sheetOf(page, 'journal').locator('.journal-known');
  const rows = known.locator('.directory-list button');
  const all = await rows.count();
  expect(all).toBeGreaterThan(8);

  await known.getByLabel('Find among the known', { exact: true }).fill('mira');
  await expect(rows.filter({ hasText: 'Mira Vale' })).toHaveCount(1);
  expect(await rows.count()).toBeLessThan(all);
  for (const row of await rows.all()) await expect(row).toContainText(/mira/i);

  await known.getByLabel('Find among the known', { exact: true }).fill('');
  await expect(rows).toHaveCount(all);
  const places = known.getByRole('group', { name: 'Show' }).getByRole('button', {
    name: /^location/,
  });
  await places.click();
  await expect(places).toHaveAttribute('aria-pressed', 'true');
  for (const kind of await known.locator('.directory-kind').allTextContents()) {
    expect(kind).toBe('location');
  }
  // A row still opens its details beside the section.
  await rows.first().click();
  await expect(page.locator('.detail-panel')).toBeVisible();
  await expect(sheetOf(page, 'journal')).toBeVisible();

  await known.getByLabel('Find among the known', { exact: true }).fill('no such name');
  await expect(rows).toHaveCount(0);
  await expect(known.getByText('Nothing known matches.')).toBeVisible();
});
