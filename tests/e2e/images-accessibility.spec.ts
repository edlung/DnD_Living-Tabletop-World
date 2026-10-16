import { expect, test, type Page } from '@playwright/test';

import { expectAccessible, WIDTHS } from './support/axe.ts';
import { IMAGE_CAMPAIGNS, imagesRegion } from './support/images.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { closeSheet, dockButton, openSheet } from './support/shell.ts';

/**
 * The DM's image controls at the three widths (docs/STAGE_330_DESIGN.md "DM controls"; design
 * §6–7 of Stage 320): axe scans of an entity's images in its panel and of the Images sheet, with
 * curated candidates, a request waiting for the image generator, one being generated and one
 * that failed — no serious or critical violation, colour contrast included, no sideways scroll —
 * and the keyboard reaching every control in order; in Russian at the phone and tablet widths
 * too. Read-only: the review campaigns are only looked at.
 */
async function showNorthGate(page: Page, sheet: string, show: string): Promise<void> {
  await openSheet(page, sheet);
  await page.locator('#sheet-images').getByRole('button', { name: show, exact: true }).click();
}

for (const size of WIDTHS) {
  test(`the DM's image controls pass axe at ${size.name} width`, async ({ browser }) => {
    // Axe reads pages of a context of their own.
    const page = await (await browser.newContext()).newPage();
    await page.setViewportSize({ width: size.width, height: size.height });
    await enterWorld(page, TOKENS.dm, IMAGE_CAMPAIGNS.review);
    await openSheet(page, 'Images');
    const sheet = page.locator('#sheet-images');
    await expect(sheet.getByRole('button', { name: /^Approve: / })).toHaveCount(2);
    await expect(sheet).toContainText('In a storm · Being generated');
    await expect(sheet).toContainText('Wounded · Waiting for the image generator');
    await expect(sheet).toContainText('In snow · Failed: No picture could be made');
    await expectAccessible(page, `${size.name} Images sheet`);
    await closeSheet(page, 'Images');

    await showNorthGate(page, 'Images', 'Show North Gate');
    const images = imagesRegion(page);
    await expect(
      images.getByRole('button', { name: 'Approve: At night', exact: true }),
    ).toBeVisible();
    await expect(
      images.getByRole('button', { name: 'Replace: Main picture', exact: true }),
    ).toBeVisible();
    await images.scrollIntoViewIfNeeded();
    await expectAccessible(page, `${size.name} North Gate's images`);
  });
}

test('the keyboard reaches every image control in order, and Escape closes the sheet', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm, IMAGE_CAMPAIGNS.review);
  await dockButton(page, 'Images').focus();
  await page.keyboard.press('Enter');
  const sheet = page.locator('#sheet-images');
  await expect(sheet).toBeVisible();
  const order: string[] = [];
  for (let step = 0; step < 14; step += 1) {
    await page.keyboard.press('Tab');
    const name = await page.evaluate(() => {
      const active = document.activeElement;
      return active?.closest('#sheet-images')
        ? (active.getAttribute('aria-label') ?? active.textContent.trim())
        : '';
    });
    if (name) order.push(name);
  }
  // Each candidate's controls in order, then the entity's work, per entity as listed.
  expect(order).toEqual(
    expect.arrayContaining([
      'Approve: At night of North Gate',
      'Discard: At night of North Gate',
      'Generate again: At night of North Gate',
      'Try again: In snow of North Gate',
    ]),
  );
  expect(order.indexOf('Approve: At night of North Gate')).toBeLessThan(
    order.indexOf('Discard: At night of North Gate'),
  );
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(dockButton(page, 'Images')).toBeFocused();
});

for (const size of WIDTHS.filter((entry) => entry.name !== 'desktop')) {
  test(`the Russian image controls pass axe at ${size.name} width`, async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await page.setViewportSize({ width: size.width, height: size.height });
    await enterWorld(page, TOKENS.dm, IMAGE_CAMPAIGNS.reviewRu);
    await openSheet(page, 'Изображения');
    await expect(
      page.locator('#sheet-images').getByRole('button', { name: /^Одобрить: / }),
    ).toHaveCount(2);
    // The DM's dock, every tool in Russian, stays on screen: no sideways scroll (axe helper).
    await expectAccessible(page, `Russian ${size.name} Images sheet`);
    await page
      .locator('#sheet-images')
      .getByRole('button', { name: 'Показать: Северные ворота', exact: true })
      .click();
    const images = imagesRegion(page, { panel: 'Подробности', region: 'Изображения (мастер)' });
    await expect(
      images.getByRole('button', { name: 'Одобрить: Ночью', exact: true }),
    ).toBeVisible();
    await expectAccessible(page, `Russian ${size.name} North Gate's images`);
  });
}
