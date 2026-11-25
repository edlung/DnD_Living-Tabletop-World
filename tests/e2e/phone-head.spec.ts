import { expect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { enterWorld } from './support/session.ts';
import { bookPart, openTopMenu } from './support/shell.ts';

/**
 * A player's phone (docs/adr/0075-book-interface.md §21): the head is one row — the hero's plate
 * with hit points and Armor Class, the live mark and "More", whose list holds the view, how to
 * play, refresh and leaving; the Scene has no row of tabs, a page opened over it has its head
 * row; the d20 stands first at the page's foot. Read-only on `ravenford`.
 */
test.use({ viewport: { width: 390, height: 844 } });

test('a player’s phone opens on the hero: a head of one row, “More”, the d20 first', async ({
  page,
}) => {
  await enterWorld(page);
  const head = page.locator('header.topbar');
  const plate = head.getByRole('button', { name: 'Open the sheet of Elowen Starwhisper' });
  await expect(plate).toBeVisible();
  // One row: the head is no taller than a row of controls.
  const box = await head.boundingBox();
  expect(box?.height ?? Infinity).toBeLessThanOrEqual(58);
  // A finger's width: "More" and the hero's plate are 44 px high in it.
  const moreBox = await head.getByRole('button', { name: 'More', exact: true }).boundingBox();
  expect(Math.min(moreBox?.width ?? 0, moreBox?.height ?? 0)).toBeGreaterThanOrEqual(44);
  expect((await plate.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  // The hero's own numbers, as the sheet has them.
  await expect(plate).toContainText('Elowen Starwhisper');
  await expect(plate).toContainText(/\d+\/\d+/);
  await expect(plate).toHaveAccessibleDescription(/Hit points: \d+ \/ \d+ · Armor class \d+/);
  // The campaign's name stays the page's heading, read not shown.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Missing Caravan');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);

  // The Scene, a part of one page, has no row of tabs; the scene begins right under the head.
  await expect(page.locator('nav.book-pages')).toBeHidden();
  await expectAccessible(page, 'a player’s phone at the Scene');

  // "More": closed, its rows are out of reach; open, each is a named row.
  const more = head.getByRole('button', { name: 'More', exact: true });
  const view = page.getByLabel('Perspective', { exact: true });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(view).toBeHidden();
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(view).toBeVisible();
  for (const name of ['How to play', 'Refresh world', 'Leave session']) {
    const row = head.getByRole('button', { name, exact: true });
    await expect(row).toBeVisible();
    await expect(row).toContainText(name);
  }
  await expectAccessible(page, 'a player’s phone with “More” open');
  // Escape closes it and gives focus back; a press outside closes it too.
  await page.keyboard.press('Escape');
  await expect(view).toBeHidden();
  await expect(more).toBeFocused();
  await more.click();
  await expect(view).toBeVisible();
  await page.locator('.stage').click({ position: { x: 195, y: 300 } });
  await expect(view).toBeHidden();
  // A row that opens a dialog keeps the list under it; the guide reads over it.
  await openTopMenu(page);
  await head.getByRole('button', { name: 'How to play', exact: true }).click();
  const guide = page.getByRole('dialog', { name: 'How to play' });
  await expect(guide).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(view).toBeHidden();
  // A row that is done with the list closes it and hands the focus to "More": it does not stay
  // on a row that went out of sight.
  await openTopMenu(page);
  await head.getByRole('button', { name: 'Refresh world', exact: true }).click();
  await expect(view).toBeHidden();
  await expect(more).toBeFocused();
  await expect(plate).toBeVisible();

  // The plate opens the hero's sheet.
  await plate.click();
  const sheet = page.getByRole('dialog', { name: 'Character: Elowen Starwhisper' });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // The d20 stands first at the page's foot.
  const foot = page.getByRole('group', { name: 'The dice at the foot of the page' });
  const d20 = await foot.getByRole('button', { name: 'Roll a d20 for the table' }).boundingBox();
  const d6 = await foot.getByRole('button', { name: 'Roll a d6 for the table' }).boundingBox();
  expect(d20?.x ?? Infinity).toBeLessThan(d6?.x ?? 0);
  expect(d20?.width ?? 0).toBeGreaterThan(d6?.width ?? Infinity);
  // Nothing rolled yet: the foot has no room for the sentence, and shows no half of it.
  await expect(foot.getByText('No dice yet')).toBeHidden();

  // A page opened over the stage keeps its head row, where Close is.
  await bookPart(page, 'World').click();
  await expect(page.locator('#sheet-places')).toBeVisible();
  await expect(page.locator('nav.book-pages')).toBeVisible();
});

test('a phone’s view of the party has no hero’s plate: the campaign’s name stands', async ({
  page,
}) => {
  await enterWorld(page);
  const head = page.locator('header.topbar');
  await expect(head.getByRole('button', { name: /^Open the sheet of / })).toBeVisible();
  await openTopMenu(page);
  await page.getByLabel('Perspective', { exact: true }).selectOption('PARTY');
  await expect(head.getByRole('button', { name: /^Open the sheet of / })).toHaveCount(0);
  await expect(head.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(head.getByRole('heading', { level: 1 })).toHaveText('The Missing Caravan');
});
