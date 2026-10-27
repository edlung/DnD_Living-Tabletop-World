import { expect, test, type Page } from '@playwright/test';

import {
  commandAction,
  enterInvestigation,
  INVESTIGATION_CAMPAIGNS,
  travelTo,
} from './support/investigation.ts';
import { enterWorld, TOKENS } from './support/session.ts';

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

/** Words split across lines in the elements' text: a name or hint broken mid-word. */
async function brokenWords(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((elements) =>
    elements.flatMap((element) => {
      const broken: string[] = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        for (const match of text.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
          if (lines.size > 1) broken.push(match[0]);
        }
      }
      return broken;
    }),
  );
}

test('beside an open conversation and a result the scene keeps room for its names (Stage 360)', async ({
  page,
}) => {
  // Read-only: talking with no dialogue provider records nothing. The stand-in pass saw
  // "Elowen Starwhispe r" and the hint one word a line, squeezed between the two.
  await page.setViewportSize({ width: 1280, height: 800 });
  await enterWorld(page);
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  await page
    .getByRole('complementary', { name: 'Entity details' })
    .getByRole('button', { name: 'Talk', exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Conversation with Mira Vale' })).toBeVisible();
  await expect(page.locator('.outcome')).toBeVisible();
  expect(await brokenWords(page, '.scene-presence .name-plate strong, .scene-caption')).toEqual([]);
  expect(await unreachable(page)).toEqual([]);
  const overlaps = await page.locator('.scene-presence').evaluate((row) => {
    const box = row.getBoundingClientRect();
    return ['.outcome', '.dialogue-panel', '.exits'].filter((selector) => {
      const other = document.querySelector(selector)?.getBoundingClientRect();
      return (
        other &&
        box.left < other.right &&
        other.left < box.right &&
        box.top < other.bottom &&
        other.top < box.bottom
      );
    });
  });
  expect(overlaps).toEqual([]);
});

/** Dock buttons a pointer at their centre does not reach (something lies over them). */
async function coveredDockButtons(page: Page): Promise<string[]> {
  return page.locator('nav.dock button').evaluateAll((buttons) =>
    buttons
      .filter((button) => {
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return !button.contains(hit);
      })
      .map((button) => button.getAttribute('aria-label') ?? ''),
  );
}

for (const width of [768, 1024]) {
  test(`with the selection's drawer open every dock item stays reachable at ${String(width)} px (Stage 360)`, async ({
    browser,
  }) => {
    // The DM's dock holds every tool; the drawer once covered its right half.
    const dm = await browser.newPage({ viewport: { width, height: 1024 } });
    await enterWorld(dm, TOKENS.dm);
    await dm.getByRole('button', { name: 'Mira Vale', exact: true }).click();
    await expect(dm.getByRole('complementary', { name: 'Entity details' })).toBeVisible();
    await expect(dm.locator('nav.dock button')).toHaveCount(9);
    expect(await coveredDockButtons(dm)).toEqual([]);

    // A player's result at the drawer's foot keeps clear of the dock too (read-only: talking with
    // no dialogue provider records nothing).
    const player = await browser.newPage({ viewport: { width, height: 1024 } });
    await enterWorld(player);
    await player.getByRole('button', { name: 'Mira Vale', exact: true }).click();
    await player
      .getByRole('complementary', { name: 'Entity details' })
      .getByRole('button', { name: 'Talk', exact: true })
      .click();
    await expect(player.locator('.outcome')).toBeVisible();
    expect(await coveredDockButtons(player)).toEqual([]);
    const [outcome, dock] = await Promise.all([
      player.locator('.outcome').boundingBox(),
      player.locator('nav.dock').boundingBox(),
    ]);
    expect((outcome?.y ?? 0) + (outcome?.height ?? 0)).toBeLessThanOrEqual(dock?.y ?? 0);
  });
}
