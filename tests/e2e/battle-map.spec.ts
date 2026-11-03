import { expect as baseExpect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { battlefield, square } from './support/combat.ts';
import { imagesRegion, lineage } from './support/images.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { chooseLocation, closeSheet, openSheet } from './support/shell.ts';

/**
 * The DM's own battle map (Stage 670b, docs/adr/0057-encounters-maps-loot.md §3): on the Old Trade
 * Road, which has its curated picture and battle map, the DM uploads a map of 1,200 × 900 px with
 * 70 px cells from (25, 10) while the asset worker runs, lines its grid up, and starts a fight
 * there: the fight takes the map's 16 × 12 squares and draws the picture under them, a cell under
 * a square.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.battleMap;

/** A drawn map: 1,200 × 900 px, its grid of 70 px cells starting at (25, 10). */
async function drawnMap(page: Page): Promise<Buffer> {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 900;
    const ink = canvas.getContext('2d');
    if (!ink) return '';
    ink.fillStyle = '#4a5d3a';
    ink.fillRect(0, 0, 1200, 900);
    ink.strokeStyle = '#1d2618';
    for (let x = 25; x < 1200; x += 70) ink.strokeRect(x, 0, 1, 900);
    for (let y = 10; y < 900; y += 70) ink.strokeRect(0, y, 1200, 1);
    return canvas.toDataURL('image/png').split(',')[1] ?? '';
  });
  return Buffer.from(data, 'base64');
}

test('the DM uploads a battle map, lines its grid up, and the fight takes it', async ({ page }) => {
  test.setTimeout(120_000);
  await enterWorld(page, TOKENS.dm, CAMPAIGN);
  await openSheet(page, 'Journal');
  await page
    .locator('#sheet-journal')
    .getByRole('button', { name: /Old Trade Road/ })
    .click();
  await closeSheet(page, 'Journal');
  const images = imagesRegion(page);
  const upload = images.getByRole('region', { name: 'Your own battle map' });
  await expect(upload).toContainText(
    'A PNG, JPEG or WebP picture of up to 10 MB, seen from above.',
  );
  await upload.getByLabel('Upload a battle map').setInputFiles({
    name: 'road-map.png',
    mimeType: 'image/png',
    buffer: await drawnMap(page),
  });
  await expect(upload.getByRole('status')).toHaveText(
    'The battle map is approved: line its grid up next.',
  );

  // The grid: 70 px cells, the first whole one 25 px from the left and 10 px from the top.
  await images.getByRole('button', { name: /^Line up the grid: / }).click();
  const editor = images.getByRole('region', { name: /^Line up the grid: / });
  await editor.getByLabel('Cell size in pixels').fill('70');
  await editor.getByLabel('First cell from the left, in pixels').fill('25');
  await editor.getByLabel('First cell from the top, in pixels').fill('10');
  await expect(editor.getByRole('status')).toHaveText('The fight here takes 16 × 12 squares.');
  await expectAccessible(page, 'the battle map’s grid');
  await editor.getByRole('button', { name: 'Save the grid' }).click();
  await expect(
    images.locator('.image-card--approved').filter({ hasText: 'Battle map' }),
  ).toContainText('The fight here takes 16 × 12 squares.');
  // The uploaded map superseded the curated one, through the lineage, never a model.
  const maps = (await lineage(page, CAMPAIGN)).assets.filter(
    (asset) => asset.entityId === 'old-trade-road' && asset.purpose === 'battle-map',
  );
  expect(maps.filter((asset) => asset.status === 'APPROVED')).toEqual([
    expect.objectContaining({
      generator: { provider: 'upload', model: 'dm-upload' },
      grid: { cellPx: 70, originX: 25, originY: 10, columns: 16, rows: 12 },
    }),
  ]);

  // A fight on the road: its field is the map's, the picture under its squares.
  await chooseLocation(page, 'old-trade-road');
  await openSheet(page, 'Encounter');
  const sheet = page.locator('#sheet-encounter');
  await expect(sheet).toContainText('On the place’s battle map: 16 × 12 squares.');
  await sheet.getByRole('button', { name: 'Start encounter', exact: true }).click();
  await expect(sheet.getByRole('heading', { name: 'Encounter controls (DM)' })).toBeVisible();
  await page.keyboard.press('Escape');
  const board = battlefield(page);
  await board.getByRole('button', { name: 'Flat board', exact: true }).click();
  await expect(square(page, 15, 11)).toHaveCount(1);
  await expect(square(page, 16, 0)).toHaveCount(0);
  await expect(board.locator('.board-map--aligned')).toHaveCount(1);
  // A cell of the picture lies under a square: 1,200 px at the square's size over 70 px.
  const plane = await board.locator('.board-plane').boundingBox();
  const map = await board.locator('.board-map--aligned').boundingBox();
  if (!plane || !map) throw new Error('the board is not shown');
  const cell = plane.width / 16;
  expect(map.width).toBeCloseTo((1200 * cell) / 70, 0);
  expect(map.x - plane.x).toBeCloseTo((-25 * cell) / 70, 0);
  expect(map.y - plane.y).toBeCloseTo((-10 * cell) / 70, 0);
});
