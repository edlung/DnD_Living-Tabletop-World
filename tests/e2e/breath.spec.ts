import { expect as baseExpect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { COMBAT_CAMPAIGNS, enterCombat, expectAccepted, submit } from './support/combat.ts';
import { TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * A creature's breath (docs/adr/0053-monsters-as-data.md §2): on Raider 1's turn the DM aims its
 * Fire Breath at Elowen; the World Engine rolls; then the breath is spent until its Recharge.
 */
const expect = baseExpect.configure({ timeout: 15_000 });

test('the DM breathes fire with a creature, and the breath is then spent', async ({ page }) => {
  await enterCombat(page, COMBAT_CAMPAIGNS.breath, TOKENS.dm);
  await openSheet(page, 'Encounter');
  const card = page.getByRole('region', { name: /actions with a save$/ });
  await expect(card).toContainText('Fire Breath: ready');
  await card.getByLabel('Aimed at', { exact: true }).selectOption({ label: 'Elowen Starwhisper' });
  await expectAccessible(page, 'the creature’s actions');
  expectAccepted(await submit(page, card.getByRole('button', { name: 'Fire Breath' })));
  await expect(card).toContainText('Fire Breath: spent, back on a d6 of 5 or more');
  await expect(card.getByRole('button', { name: 'Fire Breath' })).toBeDisabled();
});
