import { expect, test } from '@playwright/test';

import {
  anchor,
  battlefield,
  COMBAT_CAMPAIGNS,
  enterCombat,
  expectAccepted,
  submit,
} from './support/combat.ts';
import { enterWorld, TOKENS } from './support/session.ts';

const campaign = COMBAT_CAMPAIGNS.lifecycle;

test('the DM starts, runs, and ends an encounter and the player returns to exploration', async ({
  browser,
}) => {
  const dm = await browser.newPage();
  const player = await browser.newPage();
  await enterWorld(dm, TOKENS.dm, campaign);
  await expect(dm.getByRole('region', { name: 'Battlefield', exact: true })).toHaveCount(0);

  // The ambush happens on the Old Trade Road, where the party and goblins stand.
  await dm.getByLabel('Location', { exact: true }).selectOption('old-trade-road');
  await dm.getByText('Start an encounter (DM)', { exact: true }).click();
  await expect(dm.getByRole('checkbox')).toHaveCount(5);
  expectAccepted(await submit(dm, dm.getByRole('button', { name: 'Start encounter' })));
  await expect(battlefield(dm)).toBeVisible();
  await expect(anchor(dm)).toContainText('Round 1');

  // The player sees the encounter that now runs and can end their own turn.
  await enterCombat(player, campaign);
  expectAccepted(await submit(player, anchor(player).getByRole('button', { name: 'End turn' })));

  // The DM runs exactly the command the server suggests for the creature's turn.
  await dm.getByRole('button', { name: 'Refresh world' }).click();
  const suggestion = dm.getByRole('button', { name: /^Run suggested / });
  await expect(suggestion).toBeVisible();
  expectAccepted(await submit(dm, suggestion));

  // Leaving the encounter uses the domain lifecycle; both views return to exploration.
  expectAccepted(await submit(dm, dm.getByRole('button', { name: 'End encounter' })));
  await expect(battlefield(dm)).toHaveCount(0);
  await expect(dm.getByText('Start an encounter (DM)', { exact: true })).toBeVisible();
  await player.getByRole('button', { name: 'Refresh world' }).click();
  await expect(battlefield(player)).toHaveCount(0);
  await expect(
    player.getByText('No active encounter is visible in this perspective.'),
  ).toBeVisible();
  // Exploration options work again now that no encounter holds the world.
  await player
    .getByRole('region', { name: 'Scene', exact: true })
    .getByRole('button', { name: /goblin|Unidentified creature/i })
    .first()
    .click();
  await expect(
    player
      .getByRole('complementary', { name: 'Entity details' })
      .getByRole('button', { name: 'Inspect', exact: true }),
  ).toBeEnabled();
  const encounter = await player.request.get(`/api/campaigns/${campaign}/encounter`, {
    headers: { authorization: `Bearer ${TOKENS.player}` },
    params: { perspective: 'PLAYER' },
  });
  expect(((await encounter.json()) as { encounter: unknown }).encounter).toBeNull();
  await player.close();
  await dm.close();
});
