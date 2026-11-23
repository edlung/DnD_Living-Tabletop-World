import { expect, test, type Page } from '@playwright/test';

import { enterWorld, TOKENS } from './support/session.ts';
import { bookPart, dockButton, expectOnTop, openSheet } from './support/shell.ts';

/**
 * A section of the DM's book is a whole page (work-orders/FULLSCREEN_SECTIONS_2026-11-21.md,
 * docs/adr/0075-book-interface.md §3): under the part's tabs, beside the bookmarks, inside the
 * binding; it closes by its Close button, by Escape and by its own tab, and focus comes back to
 * the Scene's bookmark. Its content is laid out across the width, so Places and the Journal need
 * no scrolling of the section on a laptop.
 */
const sheetOf = (page: Page, id: string) => page.locator(`#sheet-${id}`);

/**
 * How far the section's edges are from the book's page: from the tabs' foot to the binding's
 * edge below, from the binding's edge on the left to the bookmarks (10 px of binding each side).
 */
async function offPage(page: Page, id: string): Promise<number> {
  return sheetOf(page, id).evaluate((sheet) => {
    const stage = sheet.closest('.stage');
    const tabs = document.querySelector('nav.book-pages');
    const parts = document.querySelector('nav.book-parts');
    if (!stage || !tabs || !parts) return Number.POSITIVE_INFINITY;
    const a = sheet.getBoundingClientRect();
    const b = stage.getBoundingClientRect();
    return Math.max(
      Math.abs(a.left - (b.left + 10)),
      Math.abs(a.top - tabs.getBoundingClientRect().bottom),
      Math.abs(a.right - parts.getBoundingClientRect().left),
      Math.abs(a.bottom - (b.bottom - 10)),
    );
  });
}

test('a section is a whole page of the DM’s book and closes three ways', async ({ page }) => {
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
    await expect.poll(() => offPage(page, id), `${name} fills the page`).toBeLessThanOrEqual(1);
    // Its tab stays in reach over the section, and the section's Close is never covered.
    await expectOnTop(dockButton(page, name));
    const close = sheetOf(page, id).getByRole('button', { name: /^Close/ });
    await expectOnTop(close);
    await close.click();
    await expect(sheetOf(page, id)).toBeHidden();
    await expect(bookPart(page, 'Scene')).toBeFocused();
  }

  await openSheet(page, 'Journal');
  await page.keyboard.press('Escape');
  await expect(sheetOf(page, 'journal')).toBeHidden();
  await expect(bookPart(page, 'Scene')).toBeFocused();

  await openSheet(page, 'Places');
  await dockButton(page, 'Places').click();
  await expect(sheetOf(page, 'places')).toBeHidden();

  // The Scene's bookmark is the way back from any section too.
  await openSheet(page, 'Dice');
  await bookPart(page, 'Scene').click();
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
