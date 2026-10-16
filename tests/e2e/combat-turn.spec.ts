import { expect, test } from '@playwright/test';

import {
  anchor,
  battlefield,
  clickSquare,
  COMBAT_CAMPAIGNS,
  enterCombat,
  expectAccepted,
  square,
  submit,
  turnTray,
} from './support/combat.ts';
import { collectApiBodies } from './support/session.ts';

const campaign = COMBAT_CAMPAIGNS.turn;

test('the battlefield shows terrain, cover, and tokens, and a turn moves, attacks, and ends', async ({
  page,
}) => {
  const traffic = collectApiBodies(page);
  await enterCombat(page, campaign);
  await expect(anchor(page)).toContainText('Round 1');
  await expect(anchor(page)).toContainText('Turn: Elowen Starwhisper');
  await expect(anchor(page)).toContainText('You: 78 / 78 HP');
  await expect(square(page, 0, 9)).toHaveAccessibleName(/difficult terrain/);
  await expect(square(page, 7, 4)).toHaveAccessibleName(/half cover/);
  await expect(square(page, 3, 2)).toHaveAccessibleName(/total cover/);
  await expect(square(page, 2, 6)).toHaveAccessibleName(/Elowen Starwhisper \(you\), party/);
  await expect(square(page, 8, 4)).toHaveAccessibleName(/Unidentified creature 1, hostile/);
  // Unnamed combatants are numbered in turn order, never shown by their IDs.
  await expect(square(page, 12, 6)).toHaveAccessibleName(/Unidentified creature 4, hostile/);
  await expect(battlefield(page)).not.toContainText('goblin');
  // A figure in cover shows its piece behind it and the cover level beside it.
  await expect(square(page, 8, 4).locator('.token-cover')).toHaveText('½');
  await expect(square(page, 12, 6).locator('.token-cover')).toHaveText('¾');
  await expect(square(page, 8, 4).locator('.cover-art')).toBeVisible();
  await square(page, 3, 2).hover();
  await expect(battlefield(page).locator('.terrain-card')).toContainText('Total cover');
  await square(page, 0, 9).hover();
  await expect(battlefield(page).locator('.terrain-card')).toContainText('Difficult terrain');
  await page.mouse.move(1, 1);
  // Whose turn it is, with her own armour class and speed from her own sheet.
  const active = battlefield(page).getByRole('region', { name: 'Active combatant' });
  await expect(active).toContainText('Elowen Starwhisper');
  await expect(active).toContainText('78 / 78');
  await expect(active).toContainText(/Armor class\s*17/);
  await expect(active).toContainText(/Speed\s*30 ft/);
  // No permanent action bar: options exist only for a chosen square or combatant.
  await expect(battlefield(page).getByRole('button', { name: 'Move here' })).toHaveCount(0);
  await expect(turnTray(page).getByRole('button')).toHaveCount(1);

  await square(page, 5, 6).click();
  await expect(battlefield(page)).toContainText('Route: 3 squares, about 15 ft');
  const moved = await submit(page, battlefield(page).getByRole('button', { name: 'Move here' }));
  expectAccepted(moved);
  await expect(page.getByRole('status').filter({ hasText: 'You moved to 5, 6.' })).toBeVisible();
  await expect(square(page, 5, 6)).toHaveAccessibleName(/Elowen Starwhisper \(you\)/);
  await expect(square(page, 2, 6)).not.toHaveAccessibleName(/Elowen/);
  await expect(battlefield(page).getByRole('button', { name: 'Move here' })).toHaveCount(0);

  await clickSquare(page, 8, 4);
  const options = battlefield(page).getByRole('region', {
    name: 'Options for Unidentified creature 1',
  });
  await expect(options).toContainText('Distance: 15 ft');
  await expect(options).toBeFocused();
  // The options are described beside the target and carried out from the turn tray.
  await expect(options).toContainText('Attack Unidentified creature 1 with longbow');
  const attack = turnTray(page).getByRole('button', {
    name: 'Attack Unidentified creature 1 with longbow',
  });
  await expect(attack).toHaveAccessibleDescription(/Attack Unidentified creature 1 with longbow/);
  const attacked = await submit(page, attack);
  expectAccepted(attacked);
  expect(attacked.body.outcome?.kind).toBe('Attack');
  await expect(
    page.getByRole('status').filter({ hasText: /^(Hit|Critical hit|Miss)/ }),
  ).toBeVisible();

  // The rules, not the client, refuse a move beyond the remaining speed.
  await square(page, 0, 0).click();
  const refused = await submit(page, battlefield(page).getByRole('button', { name: 'Move here' }));
  expect(refused.response.status()).toBe(422);
  expect(refused.body).toMatchObject({ status: 'rejected', code: 'ILLEGAL_ACTION' });
  await expect(page.getByRole('status').filter({ hasText: 'not enough movement' })).toBeVisible();
  await expect(square(page, 5, 6)).toHaveAccessibleName(/Elowen Starwhisper \(you\)/);

  const ended = await submit(page, turnTray(page).getByRole('button', { name: 'End turn' }));
  expectAccepted(ended);
  await expect(anchor(page)).toContainText('Turn: Unidentified creature 1');
  await expect(turnTray(page)).toHaveCount(0);
  await expect(battlefield(page).getByRole('button', { name: 'End turn' })).toHaveCount(0);
  await expect(anchor(page)).toContainText('the DM runs creature turns');
  // No creature's initiative or armour class reached her; only her own sheet carries hers.
  await traffic.assertPlayerBoundary(
    ['"initiative"', '"armorClass"'],
    ['"abandoned-caravan-site"'],
    ['/entities/elowen-starwhisper/sheet'],
  );
});
