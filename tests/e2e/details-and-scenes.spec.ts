import { expect, test } from '@playwright/test';

import {
  enterWorld,
  expectPlayerBoundary,
  holdResponse,
  playerScene,
  TOKENS,
} from './support/session.ts';

test('full authorized character sheet remains reachable from the selected character', async ({
  page,
}) => {
  await playerScene(page);
  await page.getByRole('button', { name: 'Elowen Starwhisper', exact: true }).click();
  await page.getByRole('button', { name: 'Full character sheet', exact: true }).click();
  const details = page.getByRole('complementary', { name: 'Entity details' });
  const sheet = details.getByRole('region', { name: 'Character sheet', exact: true });
  await expect(sheet).toBeVisible();
  for (const label of [
    'Proficiencies and attacks',
    'Spell slots',
    'Spellcasting sources and free casts',
    'Conditions, concentration and death saves',
  ]) {
    await sheet.getByText(label, { exact: true }).click();
  }
  await expect(sheet.getByRole('table', { name: 'Spell slots by level' })).toBeVisible();
  await expect(sheet.getByRole('table').getByRole('row')).toHaveCount(10);
  await expect(sheet.getByText(/Detect magic.*Counterspell/i)).toBeVisible();
  await expect(details).toContainText(/ranger/i);
  await expect(details).toContainText(/wizard/i);
  await expect(details).toContainText(/counterspell/i);
  await expect(details).toContainText(/longbow/i);
  await expect(details).toContainText('78');
  await expectPlayerBoundary(page);
});

test('real empty scene and failed scene load can recover', async ({ page }) => {
  await playerScene(page);
  await page.getByLabel('Location', { exact: true }).selectOption('golden-stag-inn');
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
  await page.getByLabel('Location', { exact: true }).selectOption('market-square');
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
  await expect(page.getByRole('region', { name: 'Character sheet', exact: true })).toContainText(
    '78 / 78',
  );
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
