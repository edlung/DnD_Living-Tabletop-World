import { expect, test, type Page } from '@playwright/test';

import {
  commandAction,
  enterInvestigation,
  INVESTIGATION_CAMPAIGNS,
  travelTo,
} from './support/investigation.ts';

/**
 * Gate 06: a result with nothing to anchor it to (inspecting the place itself) sat bottom
 * centre, over the row of people and things, and swallowed their clicks. Every one of them
 * stays reachable while the result shows: on a desktop with the selection's column, and on a
 * tablet once its drawer is closed (docs/STAGE_320_DESIGN.md §5.2–5.3; stage.css).
 */
async function unreachable(page: Page): Promise<string[]> {
  return page.locator('.object-button').evaluateAll((buttons) =>
    buttons
      .filter((button) => {
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return !button.contains(hit);
      })
      .map((button) => button.textContent.trim()),
  );
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

  await page.setViewportSize({ width: 768, height: 1024 });
  await page
    .getByRole('complementary', { name: 'Entity details' })
    .getByRole('button', { name: /^Close/ })
    .click();
  await expect(result).toBeVisible();
  expect(await unreachable(page)).toEqual([]);
});
