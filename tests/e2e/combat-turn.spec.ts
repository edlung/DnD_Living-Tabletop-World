import { expect, test } from '@playwright/test';

import {
  anchor,
  battlefield,
  COMBAT_CAMPAIGNS,
  enterCombat,
  expectAccepted,
  square,
  submit,
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
  await expect(square(page, 8, 4)).toHaveAccessibleName(/goblin-raider-1, hostile/);
  // No permanent action bar: options exist only for a chosen square or combatant.
  await expect(battlefield(page).getByRole('button', { name: 'Move here' })).toHaveCount(0);

  await square(page, 5, 6).click();
  await expect(battlefield(page)).toContainText('Route: 3 squares, about 15 ft');
  const moved = await submit(page, battlefield(page).getByRole('button', { name: 'Move here' }));
  expectAccepted(moved);
  await expect(page.getByRole('status').filter({ hasText: 'You moved to 5, 6.' })).toBeVisible();
  await expect(square(page, 5, 6)).toHaveAccessibleName(/Elowen Starwhisper \(you\)/);
  await expect(square(page, 2, 6)).not.toHaveAccessibleName(/Elowen/);
  await expect(battlefield(page).getByRole('button', { name: 'Move here' })).toHaveCount(0);

  await square(page, 8, 4).click();
  const options = battlefield(page).getByRole('region', { name: 'Options for goblin-raider-1' });
  await expect(options).toContainText('Distance: 15 ft');
  const attacked = await submit(
    page,
    options.getByRole('button', { name: 'Attack goblin-raider-1 with longbow' }),
  );
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

  const ended = await submit(page, anchor(page).getByRole('button', { name: 'End turn' }));
  expectAccepted(ended);
  await expect(anchor(page)).toContainText('Turn: goblin-raider-1');
  await expect(anchor(page).getByRole('button', { name: 'End turn' })).toHaveCount(0);
  await traffic.assertPlayerBoundary(
    ['"initiative"', '"armorClass"'],
    ['"abandoned-caravan-site"'],
  );
});
