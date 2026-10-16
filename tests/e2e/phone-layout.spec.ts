import { expect, test } from '@playwright/test';

import { enterWorld } from './support/session.ts';
import { expectOnTop } from './support/shell.ts';

/**
 * A phone (docs/STAGE_320_DESIGN.md §6): who is at the table is one compact strip that never
 * meets the medallions of who is present, and a result shown above the tab bar never keeps a
 * control under it — every control of the scene can be brought clear of it. Read-only:
 * talking with no dialogue provider records nothing.
 */
test.use({ viewport: { width: 390, height: 844 } });

test('on a phone the party rail is a compact strip clear of who is present', async ({ page }) => {
  await enterWorld(page);
  const rail = page.getByRole('region', { name: 'At the table', exact: true });
  const present = page.getByRole('list', { name: 'Visible world objects', exact: true });
  await expect(present).toBeVisible();
  await expect(rail.getByRole('button', { name: /Elowen Starwhisper/ })).toBeVisible();
  const strip = await rail.boundingBox();
  const row = await present.boundingBox();
  expect(strip?.height ?? Infinity).toBeLessThanOrEqual(48);
  expect((strip?.y ?? 0) + (strip?.height ?? 0)).toBeLessThanOrEqual(row?.y ?? 0);
});

test('on a phone a result never keeps a control of the scene under it', async ({ page }) => {
  await enterWorld(page);
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  const details = page.getByRole('complementary', { name: 'Entity details' });
  await details.getByRole('button', { name: 'Talk', exact: true }).click();
  const result = page
    .getByRole('status', { name: 'Action result' })
    .filter({ hasText: 'No spoken reply is available.' });
  await expect(result).toBeVisible();
  await details.getByRole('button', { name: 'Close details', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Conversation with Mira Vale' })).toBeVisible();
  await expect(result).toBeVisible();
  const controls = await page.locator('.stage .scene button:visible').all();
  expect(controls.length).toBeGreaterThan(5);
  for (const control of controls) {
    await control.evaluate((element) => {
      element.scrollIntoView({ block: 'center' });
    });
    await expectOnTop(control);
  }
});
