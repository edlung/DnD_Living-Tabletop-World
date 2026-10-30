import { expect, test, type Page } from '@playwright/test';

import { SIGN_IN_ORIGIN } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import { expectAccessible } from './support/axe.ts';
import { openWorkshopDraft, scenarioInspector } from './support/workshop.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });
test.setTimeout(120_000);
async function atWidths(page: Page, name: string) {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const flat = await page.addStyleTag({ content: '.workshop-art{visibility:hidden!important}' });
    await expectAccessible(page, `${name} at ${width}`);
    await flat.evaluate((element) => {
      element.parentNode?.removeChild(element);
    });
  }
}

test('scenario, linked inspector, correction and generation pass axe at four widths and keep keyboard focus', async ({
  page,
}) => {
  await openWorkshopDraft(page, 'scenario-a11y');
  await expect(scenarioInspector(page)).toBeVisible();
  await atWidths(page, 'scenario opening');
  const nav = page.getByRole('navigation', { name: 'Scenario objects', exact: true });
  await nav
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: /^Cast and places/ }) })
    .getByRole('button', { name: 'Iva', exact: true })
    .click();
  const inspector = scenarioInspector(page);
  await expect(inspector.getByRole('heading', { name: 'Iva', exact: true })).toBeVisible();
  await atWidths(page, 'linked scenario inspector');
  const edit = inspector.getByRole('button', { name: 'Edit fields', exact: true });
  await edit.focus();
  await page.keyboard.press('Enter');
  await expect(inspector.getByLabel('Name', { exact: true })).toBeFocused();
  await atWidths(page, 'scenario correction form');
  await inspector.getByRole('button', { name: 'Close editor', exact: true }).click();
  await expect(edit).toBeFocused();
  await page.getByRole('tab', { name: 'Scenario', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Generation', exact: true })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Generation', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await atWidths(page, 'campaign generation form');
  await page
    .getByLabel('Campaign idea', { exact: true })
    .fill('Investigate a sunken bell with several paths to the clues.');
  await page.getByRole('button', { name: 'Generate campaign', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'View generated scenario', exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await atWidths(page, 'completed campaign generation');
  await page.getByRole('button', { name: 'View result: Cast and party', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Saved preparation step', exact: true }),
  ).toBeVisible();
  await expect(
    scenarioInspector(page).getByRole('button', { name: 'Edit fields', exact: true }),
  ).toHaveCount(0);
  await atWidths(page, 'saved preparation step');
  await page.getByRole('tab', { name: 'Generation', exact: true }).focus();

  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Scenario', exact: true })).toBeFocused();
});
