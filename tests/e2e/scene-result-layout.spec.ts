import { expect, test, type Page } from '@playwright/test';

import {
  commandAction,
  enterInvestigation,
  INVESTIGATION_CAMPAIGNS,
  travelTo,
} from './support/investigation.ts';

/**
 * Gate 06: a result with nothing to anchor it to (inspecting the place itself) sat bottom
 * centre, over the row of people and things, and swallowed their clicks; anchored above the
 * medallion it concerned, it lay over the row above. Every one of them
 * stays reachable while the result shows: on a desktop with the selection's column, and on a
 * tablet once its drawer is closed (docs/STAGE_320_DESIGN.md §5.2–5.3; stage.css).
 */
async function unreachable(page: Page, besideDrawer = false): Promise<string[]> {
  return page.locator('.object-button').evaluateAll((buttons, besideDrawer) => {
    const drawer = document.querySelector('.detail-panel')?.getBoundingClientRect();
    return buttons
      .filter((button) => {
        const box = button.getBoundingClientRect();
        // Under an open drawer by design: only what the drawer leaves visible must be reachable.
        if (besideDrawer && drawer && box.x + box.width / 2 >= drawer.left) return false;
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return !button.contains(hit);
      })
      .map((button) => button.textContent.trim());
  }, besideDrawer);
}

test('the people and things in the scene stay reachable while a result shows', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterInvestigation(page, INVESTIGATION_CAMPAIGNS.resultLayout);
  await travelTo(page, 'Old Trade Road');
  await travelTo(page, 'Unidentified location');
  await commandAction(page, 'Inspect');
  const result = page.locator('.outcome');
  await expect(result).toContainText('Evidence discovered.');
  await expect(page.locator('.object-button')).toHaveCount(6);
  expect(await unreachable(page)).toEqual([]);
  // A result about one of them (it once sat above that medallion, over the row above it).
  await page
    .getByRole('region', { name: 'Scene', exact: true })
    .getByRole('button', { name: 'Unidentified item', exact: true })
    .last()
    .click();
  await commandAction(page, 'Inspect');
  await expect(result).toBeVisible();
  expect(await unreachable(page)).toEqual([]);

  // A tablet with the selection's drawer open: the result sits at the drawer's foot.
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByRole('complementary', { name: 'Entity details' })).toBeVisible();
  expect(await unreachable(page, true)).toEqual([]);
  // ... and with it closed.
  await page
    .getByRole('complementary', { name: 'Entity details' })
    .getByRole('button', { name: /^Close/ })
    .click();
  await expect(result).toBeVisible();
  expect(await unreachable(page)).toEqual([]);
});
