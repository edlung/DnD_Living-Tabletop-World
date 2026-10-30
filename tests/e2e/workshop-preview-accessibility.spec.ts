import { expect, test, type Page } from '@playwright/test';

import { SIGN_IN_ORIGIN } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import { expectAccessible } from './support/axe.ts';
import { openWorldPreview, picturesRegion, viewRegion } from './support/workshop-preview.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });
test.setTimeout(180000);
async function widths(page: Page, label: string) {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const art = await page.addStyleTag({ content: '.workshop-art{visibility:hidden!important}' });
    await expectAccessible(page, `${label} at ${width}`);
    await art.evaluate((element) => {
      element.parentNode?.removeChild(element);
    });
  }
}
test('owner preview, exact image brief and character sheet stay accessible at four widths with keyboard transitions', async ({
  page,
}) => {
  await openWorldPreview(page, 'preview-a11y');
  await page.getByRole('tab', { name: 'Generation', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'World preview', exact: true })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'World preview', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await widths(page, 'owner world preview');
  await picturesRegion(page)
    .getByLabel('Picture object', { exact: true })
    .selectOption({ label: 'Alena' });
  await expect(
    picturesRegion(page).getByRole('group', {
      name: 'What the image model will read',
      exact: true,
    }),
  ).toBeVisible();
  await widths(page, 'picture selection and appearance form');
  await page
    .getByLabel('Choose a prepared character', { exact: true })
    .selectOption({ label: 'Alena' });
  await page.getByRole('button', { name: 'Preview as character', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(viewRegion(page).getByText('Initial view of Alena', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect your prepared character', exact: true }).click();
  await page.getByRole('button', { name: 'Full character sheet', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Character sheet', exact: true })).toBeVisible();
  await widths(page, 'restricted character and own sheet');
  await page.getByRole('button', { name: 'Return to owner preview', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Choose a prepared character', { exact: true })).toBeVisible();
});
