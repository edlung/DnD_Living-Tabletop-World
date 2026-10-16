import { expect, test } from '@playwright/test';

import { enterWorld, expectPlayerBoundary, playerScene, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

test('logout and account switch remove DM data and do not persist access tokens', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm);
  await page.getByLabel('Perspective', { exact: true }).selectOption('DM');
  await openSheet(page, 'Journal');
  await expect(page.getByText('Known people & places', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ashen Circle/ })).toBeVisible();
  await page.getByRole('button', { name: 'Leave session', exact: true }).click();
  await expect(page.getByLabel('Access token', { exact: true })).toHaveValue('');
  await expectPlayerBoundary(page);
  await page.getByLabel('Access token', { exact: true }).fill(TOKENS.player);
  await page.getByRole('button', { name: 'Enter world', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible();
  await expectPlayerBoundary(page);
  const persisted = await page.evaluate(
    () => JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
  );
  expect(persisted).not.toContain(TOKENS.dm);
  expect(persisted).not.toContain(TOKENS.player);
  await page.reload();
  await expect(page.getByLabel('Access token', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toHaveCount(0);
});

test('unknown campaign and unauthorized account show errors without previous campaign data', async ({
  page,
}) => {
  await playerScene(page);
  await page.getByRole('button', { name: 'Leave session', exact: true }).click();
  await page.getByLabel('Access token', { exact: true }).fill(TOKENS.player);
  await page.getByLabel('Campaign', { exact: true }).fill('unknown-campaign');
  await page.getByRole('button', { name: 'Enter world', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Leave session', exact: true }).click();
  await page.getByLabel('Campaign', { exact: true }).fill('ravenford');
  await page.getByLabel('Access token', { exact: true }).fill(TOKENS.outsider);
  await page.getByRole('button', { name: 'Enter world', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toHaveCount(0);
  await expectPlayerBoundary(page);
  await page.getByRole('button', { name: 'Leave session', exact: true }).click();
  await page.getByLabel('Access token', { exact: true }).fill(TOKENS.player);
  await page.getByRole('button', { name: 'Enter world', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible();
});

test('narrow viewport supports keyboard entry, selection, and disclosure', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Access token', { exact: true }).fill(TOKENS.player);
  await page.getByLabel('Campaign', { exact: true }).fill('ravenford');
  await page.getByRole('button', { name: 'Enter world', exact: true }).focus();
  await page.keyboard.press('Enter');
  const character = page.getByRole('button', { name: 'Elowen Starwhisper', exact: true });
  await expect(character).toBeVisible();
  await character.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('button', { name: 'Full character sheet', exact: true });
  await expect(sheet).toBeVisible();
  await sheet.focus();
  await page.keyboard.press('Enter');
  const spellcasting = page.getByText('Spellcasting sources and free casts', { exact: true });
  await expect(spellcasting).toBeVisible();
  await spellcasting.focus();
  await page.keyboard.press('Enter');
  await expect(
    page
      .getByRole('complementary', { name: 'Entity details' })
      .getByText(/Detect magic.*Counterspell/i),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test('Back and Forward navigation require a fresh session without restoring privileged content', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm);
  await openSheet(page, 'Journal');
  await expect(page.getByText('Known people & places', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ashen Circle/ })).toBeVisible();
  await page.goto('/another-local-page');
  await page.getByLabel('Access token', { exact: true }).fill(TOKENS.player);
  await page.getByRole('button', { name: 'Enter world', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Access token', { exact: true })).toHaveValue('');
  await expectPlayerBoundary(page);
  await page.goForward();
  await expect(page.getByLabel('Access token', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toHaveCount(0);
  await expectPlayerBoundary(page);
});
