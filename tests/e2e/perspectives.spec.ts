import { expect, test } from '@playwright/test';

import {
  collectApiBodies,
  enterWorld,
  expectPlayerBoundary,
  holdResponse,
  playerScene,
  TOKENS,
} from './support/session.ts';
import { openSheet } from './support/shell.ts';

test('player uses real authorized scene and knowledge without receiving DM secrets', async ({
  page,
}) => {
  const traffic = collectApiBodies(page);
  await playerScene(page);
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Entity details' })).toContainText(
    'Mira Vale',
  );
  await page.getByText('Full knowledge', { exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Entity details' })).toContainText('Mira');
  await expect(
    page.getByLabel('Perspective', { exact: true }).locator('option[value="DM"]'),
  ).toHaveCount(0);
  await expectPlayerBoundary(page);
  await traffic.assertPlayerBoundary();
});

test('DM data disappears before a delayed player preview completes', async ({ page }) => {
  await enterWorld(page, TOKENS.dm);
  await page.getByLabel('Perspective', { exact: true }).selectOption('DM');
  await openSheet(page, 'Journal');
  await expect(page.getByText('Known people & places', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ashen Circle/ })).toBeVisible();

  const delayed = await holdResponse(
    page,
    (url) => url.pathname.endsWith('/entities') && url.searchParams.get('perspective') !== 'DM',
  );
  await page
    .getByLabel('Perspective', { exact: true })
    .selectOption('CHARACTER:elowen-starwhisper');
  await delayed.requested;
  await expect(page.getByRole('status')).toBeVisible();
  await expectPlayerBoundary(page);
  delayed.release();
  await delayed.completed;
  await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible();
  await expectPlayerBoundary(page);
});

test('failed perspective downgrade stays empty and recovers without stale DM data', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm);
  await page.getByLabel('Perspective', { exact: true }).selectOption('DM');
  await openSheet(page, 'Journal');
  await expect(page.getByText('Known people & places', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ashen Circle/ })).toBeVisible();
  let fail = true;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (
      fail &&
      url.pathname.endsWith('/entities') &&
      url.searchParams.get('perspective') !== 'DM'
    ) {
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });

  await page
    .getByLabel('Perspective', { exact: true })
    .selectOption('CHARACTER:elowen-starwhisper');
  await expect(page.getByRole('alert')).toBeVisible();
  await expectPlayerBoundary(page);
  fail = false;
  await page.getByRole('button', { name: 'Refresh world', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible();
  await expectPlayerBoundary(page);
});

test('late DM response cannot overwrite an already loaded player preview', async ({ page }) => {
  await enterWorld(page, TOKENS.dm);
  await page.getByLabel('Perspective', { exact: true }).selectOption('DM');
  await openSheet(page, 'Journal');
  await expect(page.getByText('Known people & places', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ashen Circle/ })).toBeVisible();
  const delayed = await holdResponse(
    page,
    (url) => url.pathname.endsWith('/entities') && url.searchParams.get('perspective') === 'DM',
  );
  await page.getByRole('button', { name: 'Refresh world', exact: true }).click();
  await delayed.requested;
  await page
    .getByLabel('Perspective', { exact: true })
    .selectOption('CHARACTER:elowen-starwhisper');
  await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible();
  await expectPlayerBoundary(page);
  delayed.release();
  await delayed.completed;
  await expectPlayerBoundary(page);
  await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible();
});
