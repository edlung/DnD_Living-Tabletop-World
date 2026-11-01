import { expect, test } from '@playwright/test';

import {
  enterWorld,
  expectPlayerBoundary,
  holdResponse,
  playerScene,
  TOKENS,
} from './support/session.ts';
import { chooseLocation } from './support/shell.ts';

test('full authorized character sheet remains reachable from the selected character', async ({
  page,
}) => {
  await playerScene(page);
  await page.getByRole('button', { name: 'Elowen Starwhisper', exact: true }).click();
  await page.getByRole('button', { name: 'Full character sheet', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Character: Elowen Starwhisper' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/Ranger 7.*Wizard 8/);
  await expect(dialog).toContainText('78');
  await expect(dialog.getByRole('tabpanel')).toContainText('Longbow');
  await dialog.getByRole('tab', { name: 'Spells', exact: true }).click();
  await expect(dialog.getByRole('tabpanel')).toContainText('Counterspell');
  await expect(dialog.getByRole('tabpanel')).toContainText('Detect Magic');
  await expectPlayerBoundary(page);
});

test('real empty scene and failed scene load can recover', async ({ page }) => {
  await playerScene(page);
  await chooseLocation(page, 'golden-stag-inn');
  const scene = page.getByRole('region', { name: 'Scene', exact: true });
  await expect(scene).toContainText(/not observed|no entities are visible/i);
  let fail = true;
  await page.route('**/api/**', async (route) => {
    if (fail && new URL(route.request().url()).pathname.endsWith('/market-square/scene')) {
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });
  await chooseLocation(page, 'market-square');
  await expect(scene.getByRole('alert')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Refresh world', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Scene', exact: true })).toContainText('Mira Vale');
  await expectPlayerBoundary(page);
});

test('late detail response cannot replace the newer selection', async ({ page }) => {
  await playerScene(page);
  const delayed = await holdResponse(page, (url) =>
    url.pathname.endsWith('/entities/mira-vale/knowledge'),
  );
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  await delayed.requested;
  await expect(
    page.getByRole('complementary', { name: 'Entity details' }).getByRole('status'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Elowen Starwhisper', exact: true }).click();
  const details = page.getByRole('complementary', { name: 'Entity details' });
  await expect(details).toContainText('Elowen Starwhisper');
  await expect(
    page.getByRole('button', { name: 'Full character sheet', exact: true }),
  ).toBeVisible();
  delayed.release();
  await delayed.completed;
  await expect(details).toContainText('Elowen Starwhisper');
  await expect(details.getByRole('heading', { name: 'Mira Vale', exact: true })).toHaveCount(0);
  await expectPlayerBoundary(page);
});

test('DM can read an NPC sheet while the player cannot request it through the detail flow', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm);
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  await page.getByRole('button', { name: 'Full character sheet', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Character: Mira Vale' })).toContainText('78');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Leave session', exact: true }).click();
  await page.getByLabel('Access token', { exact: true }).fill(TOKENS.player);
  await page.getByRole('button', { name: 'Enter world', exact: true }).click();
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  await expect(page.getByText('Full knowledge', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Full character sheet', exact: true })).toHaveCount(
    0,
  );
  await expectPlayerBoundary(page);
});

test('a person with no sheet says so to the DM, not that the view hides it (Stage 360)', async ({
  page,
}) => {
  // Captain Thorne, like an NPC the DM adds in words, has no character sheet.
  await enterWorld(page, TOKENS.dm);
  await chooseLocation(page, 'north-gate');
  await page.getByRole('button', { name: 'Captain Thorne', exact: true }).click();
  await page.getByRole('button', { name: 'Full character sheet', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('status').filter({ hasText: 'No character sheet is recorded here.' }),
  ).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Try again' })).toHaveCount(0);
});
