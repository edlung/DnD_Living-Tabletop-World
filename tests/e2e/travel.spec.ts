import { expect as baseExpect, test } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * The world map and travel (Stage 670g, docs/adr/0057-encounters-maps-loot.md §10): the party stands
 * on the Old Trade Road. The DM pins the road and the North Gate on Ravenford's map, sets the
 * six miles between them — grassland, a good road — and moves the party there at a Fast pace: two
 * hours on the road. Elowen's map shows her at the gate, and the DM's history tells the journey.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.travel;

test('the DM maps the road to the North Gate and the party travels it', async ({ browser }) => {
  test.setTimeout(180_000);
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await openSheet(dm, 'Places');
  const map = dm.locator('.world-map');
  await expect(map).toContainText('No map yet');

  // The DM pins two places on Ravenford's picture.
  await map.getByText('Edit the map', { exact: true }).click();
  const editor = map.locator('.map-editor');
  await editor.getByLabel('The map is the picture of').selectOption({ label: 'Ravenford' });
  const pin = async (place: string, across: string, down: string) => {
    await editor.getByLabel('Place to pin').selectOption({ label: place });
    await editor.getByLabel('Across, %').fill(across);
    await editor.getByLabel('Down, %').fill(down);
  };
  await pin('Old Trade Road', '30', '60');
  await pin('North Gate', '70', '25');
  await editor.getByRole('button', { name: 'Save the pins' }).click();
  await expect(map.locator('.map-canvas').first().locator('.map-pin')).toHaveCount(2);

  // The six miles between them.
  const route = editor.locator('.route-form');
  await route.getByLabel('First place').selectOption({ label: 'Old Trade Road' });
  await route.getByLabel('Second place').selectOption({ label: 'North Gate' });
  await route.getByLabel('Miles').fill('6');
  await route.getByLabel('Terrain').selectOption({ label: 'grassland' });
  await route.getByRole('button', { name: 'Set the route' }).click();
  await expect(map.locator('.map-route-list')).toContainText(
    'Old Trade Road to North Gate: 6 mi, grassland · a good road',
  );
  await expect(
    map.getByRole('button', { name: 'Old Trade Road, where you are', exact: true }),
  ).toBeVisible();
  await expectAccessible(dm, 'the DM’s world map');

  // The party sets out at a Fast pace.
  await map.getByText('Travel', { exact: true }).click();
  const travel = map.locator('.travel-form');
  await travel.getByLabel('Where to').selectOption({ label: 'North Gate, 6 mi' });
  await travel.getByRole('radio', { name: /^Fast pace/ }).check();
  await expect(travel.locator('.travel-sum')).toContainText('Hours on the road: 2; days: 1.');
  await travel.getByRole('button', { name: 'Set out' }).click();
  await expect(
    map.getByRole('button', { name: 'North Gate, where you are', exact: true }),
  ).toBeVisible();

  // Elowen's map shows her at the gate.
  await enterWorld(player, TOKENS.player, CAMPAIGN);
  await openSheet(player, 'Places');
  await expect(
    player.locator('.world-map').getByRole('button', { name: 'North Gate, where you are' }),
  ).toBeVisible();
  await expectAccessible(player, 'the player’s world map');

  // The DM's history tells the journey.
  await openSheet(dm, 'History');
  await expect(dm.locator('.dm-history')).toContainText(
    'Travelled from Old Trade Road to North Gate, fast pace: 2 h on the road',
  );
});

test('a Russian table reads the map in Russian', async ({ browser }) => {
  const player = await (await browser.newContext()).newPage();
  await enterWorld(player, TOKENS.player, UI_PARTY_CAMPAIGNS.travelRu);
  await openSheet(player, 'Места');
  await expect(player.locator('.world-map')).toContainText('Карты этих земель пока нет.');
});
