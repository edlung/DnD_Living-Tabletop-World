import { expect, test } from '@playwright/test';

import { battlefield, enterCombat, square } from './support/combat.ts';
import {
  detailsPanel,
  expectServedPicture,
  IMAGE_CAMPAIGNS,
  playerPresentation,
} from './support/images.ts';
import { enterWorld, expectPlayerBoundary, TOKENS } from './support/session.ts';

/**
 * The curated Ravenford set reaches the player on a fresh seed (docs/STAGE_330_DESIGN.md, ADR 0035
 * §3–4): the place's approved scene behind everything, approved portraits, figures standing in
 * the scene and on the battlefield (upright when tilted, inside the medallion when flat), the
 * encounter place's battle map under the grid, and an investigation object's picture in its
 * panel. Every picture is an object URL of bytes the player fetched itself, never a UI-kit file.
 * Read-only.
 */
test('the player sees the curated scene, portraits and standing figures', async ({ page }) => {
  await enterWorld(page, TOKENS.player, 'ravenford');
  const mira = page.getByRole('button', { name: 'Mira Vale', exact: true });
  await expect(mira).toBeVisible();
  await expectServedPicture(page.locator('.stage-backdrop .backdrop-art'));
  await expect(page.getByText('No approved image yet', { exact: true })).toHaveCount(0);
  // Who has an approved figure stands in the scene as it; the party rail keeps the portrait.
  await expectServedPicture(mira.locator('.miniature-art'));
  await expect(mira.locator('.medallion')).toHaveCount(0);
  const rail = page.getByRole('region', { name: 'At the table', exact: true });
  await expectServedPicture(rail.locator('.medallion-face img').first());
  await mira.click();
  // A person keeps the round portrait in the panel, never the figure.
  await expectServedPicture(detailsPanel(page).locator('.details-header .medallion-face img'));
  await expectPlayerBoundary(page);
});

test('the battlefield stands the approved figures on the place’s battle map', async ({ page }) => {
  await enterCombat(page, IMAGE_CAMPAIGNS.battle);
  const board = battlefield(page);
  const map = await playerPresentation(page, IMAGE_CAMPAIGNS.battle, 'old-trade-road');
  expect(map.battleMap?.purpose).toBe('battle-map');
  await expectServedPicture(board.locator('.board-map'));
  // Tilted on a wide screen: Elowen and the four goblins stand upright on their squares.
  await expect(board.locator('.board.board--tilted')).toHaveCount(1);
  const standing = board.locator('.token .miniature-art');
  await expect(standing).toHaveCount(5);
  for (const figure of await standing.all()) await expectServedPicture(figure);
  await expect(square(page, 8, 4)).toHaveAccessibleName(/Unidentified creature/);
  await expect(board).not.toContainText('goblin');

  await board.getByRole('button', { name: 'Flat board', exact: true }).click();
  await expect(board.locator('.board.board--flat')).toHaveCount(1);
  await expect(standing).toHaveCount(0);
  const inside = board.locator('.token .medallion-figure');
  await expect(inside).toHaveCount(5);
  for (const figure of await inside.all()) await expectServedPicture(figure);
  // The map stays the ground, and every square keeps its name in both views.
  await expectServedPicture(board.locator('.board-map'));
  await expect(square(page, 8, 4)).toHaveAccessibleName(/Unidentified creature/);
  await expectPlayerBoundary(page);
});

test('an investigation object shows its approved picture in its panel', async ({ page }) => {
  await enterWorld(page, TOKENS.player, IMAGE_CAMPAIGNS.site);
  const objects = page.getByRole('list', { name: 'Visible world objects', exact: true });
  const items = objects.getByRole('button', { name: 'Unidentified item', exact: true });
  await expect(items).toHaveCount(3);
  await items.first().click();
  const details = detailsPanel(page);
  await expect(details.getByRole('heading', { name: 'Unidentified item' })).toBeVisible();
  await expectServedPicture(details.locator('.details-plate img'));
  await expect(details.locator('.details-header .medallion')).toHaveCount(0);
  // The player has no image controls.
  await expect(details.getByRole('region', { name: 'Images (DM)' })).toHaveCount(0);
  await expect(page.locator('nav.dock').getByRole('button', { name: 'Images' })).toHaveCount(0);
});

test('the Russian player sees the same pictures', async ({ page }) => {
  await enterWorld(page, TOKENS.player, IMAGE_CAMPAIGNS.siteRu);
  const objects = page.getByRole('list', { name: 'Видимые объекты мира', exact: true });
  await expect(objects).toBeVisible();
  await expectServedPicture(page.locator('.stage-backdrop .backdrop-art'));
  await expectServedPicture(objects.locator('.miniature-art').first());
  await objects.getByRole('button', { name: 'Неопознанный объект (предмет)' }).first().click();
  await expectServedPicture(detailsPanel(page, 'Подробности').locator('.details-plate img'));
});
