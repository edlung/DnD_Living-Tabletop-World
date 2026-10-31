import { expect, test, type Page } from '@playwright/test';

import { SIGN_IN_ORIGIN, signInSeed } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import { workshopInvitationToken } from '../../apps/server/src/testing/ui-workshop-links.ts';
import { expectAccessible } from './support/axe.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });
test.setTimeout(120_000);

async function atWidths(page: Page, name: string) {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const flat = await page.addStyleTag({
      content: '.workshop-art { visibility: hidden !important; }',
    });
    await expectAccessible(page, `${name} at ${width}`);
    await flat.evaluate((element) => {
      element.parentNode?.removeChild(element);
    });
  }
}

test('workshop invitation and drafts are accessible on four widths and usable by keyboard', async ({
  page,
}) => {
  await page.goto(`/workshop/join#${workshopInvitationToken(signInSeed(), 'a11y')}`);
  await expect(page.getByRole('heading', { name: 'You are invited to a workshop' })).toBeVisible();
  await atWidths(page, 'workshop invitation');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Enter the workshop', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Your drafts', exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Sign out of workshop', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Campaign title', { exact: true })).toBeFocused();
  await page.keyboard.insertText('A world reached by keyboard');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Campaign language', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Create draft', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'A world reached by keyboard', exact: true }),
  ).toBeVisible();
  await atWidths(page, 'workshop drafts');
  await page.getByRole('button', { name: 'Sign out of workshop', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Stay signed in', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sign out of workshop', exact: true }),
  ).toBeFocused();
});
