import { expect, test } from '@playwright/test';

import {
  anchor,
  battlefield,
  COMBAT_CAMPAIGNS,
  enterCombat,
  expectAccepted,
  expendedSlots,
  playerHp,
  square,
  submit,
} from './support/combat.ts';

const campaign = COMBAT_CAMPAIGNS.area;

test('Fireball previews who it affects, warns about an ally, and still casts when chosen', async ({
  page,
}) => {
  await enterCombat(page, campaign);
  // Walk into the area first: the warning must reflect where the caster really stands.
  await square(page, 6, 5).click();
  expectAccepted(await submit(page, battlefield(page).getByRole('button', { name: 'Move here' })));
  await expect(square(page, 6, 5)).toHaveAccessibleName(/Elowen Starwhisper \(you\)/);

  await square(page, 8, 4).click();
  const options = battlefield(page).getByRole('region', { name: 'Options for goblin-raider-1' });
  const fireball = options.getByRole('button', { name: 'Cast Fireball at goblin-raider-1' });
  await expect(fireball).toBeEnabled();
  await expect(options).toContainText('Would affect:');
  await expect(options).toContainText('Elowen Starwhisper');
  await expect(options).toContainText('goblin-raider-1');
  await expect(options.getByRole('alert')).toContainText('includes a party member');
  // The same affected combatants are marked on the battlefield itself.
  await expect(square(page, 8, 4)).toHaveAccessibleName(/in the area/);
  await expect(square(page, 6, 5)).toHaveAccessibleName(/in the area/);

  const before = await expendedSlots(page, campaign);
  const hpBefore = await playerHp(page);
  const cast = await submit(page, fireball);
  expectAccepted(cast);
  expect(cast.body.outcome?.kind).toBe('CastSpell');
  await expect(
    page.getByRole('status').filter({ hasText: /fireball resolved on \d+ targets?\./ }),
  ).toBeVisible();
  // The server spent exactly one slot and the ally warning was a warning, not a block.
  const after = await expendedSlots(page, campaign);
  expect(after.reduce((a, b) => a + b, 0) - before.reduce((a, b) => a + b, 0)).toBe(1);
  expect(await playerHp(page)).toBeLessThan(hpBefore);
  await expect(anchor(page)).toContainText('Round 1');
});

test('Fireball centered away from every ally shows no warning', async ({ page }) => {
  await enterCombat(page, COMBAT_CAMPAIGNS.preview);
  await square(page, 11, 5).click();
  const options = battlefield(page).getByRole('region', { name: 'Options for goblin-raider-3' });
  await expect(options.getByRole('button', { name: /Cast Fireball/ })).toBeEnabled();
  await expect(options).toContainText('goblin-raider-3');
  await expect(options.getByRole('alert')).toHaveCount(0);
  await expect(options).not.toContainText('Elowen Starwhisper');
});
