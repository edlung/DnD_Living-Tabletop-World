import { expect as baseExpect, test } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * A creature a player commands (docs/adr/0044-online-play.md §7): in a running fight the DM hands
 * the creature whose turn it is to Elowen's player, whose screen then shows its turn — the rules'
 * suggested act, Do it, End its turn — and ends it; the turn passes on.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.commanded;
const PARTY = ['Elowen Starwhisper', 'Brann Ironvale', 'Maren Ashby', 'Tamsin Quickfoot'];

test('the DM hands a creature to a player, who runs its turn', async ({ browser }) => {
  test.setTimeout(120_000);
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await enterWorld(player, TOKENS.player, CAMPAIGN);
  await openSheet(dm, 'Encounter');
  const sheet = dm.locator('#sheet-encounter');
  await sheet
    .getByRole('button', { name: 'Start: Ambush on the Old Trade Road', exact: true })
    .click();
  const rows = sheet.getByRole('region', { name: 'Turn order' }).locator('ol.turn-order > li');
  await expect(rows.first()).toBeVisible();
  // Until a creature's turn comes, the party's turns wait.
  const now = rows.filter({ hasText: 'Now' });
  const nameOfNow = async () =>
    (await now.locator('.turn-order-name').innerText()).replace('Now', '').trim();
  for (let step = 0; step < 6 && PARTY.includes(await nameOfNow()); step += 1) {
    const before = await nameOfNow();
    await now.getByRole('button', { name: 'Delay the turn', exact: true }).click();
    // After a creature, so the next turn is not merely another of the party's.
    const after = now.getByLabel(`${before} acts after`, { exact: true });
    const options = await after.locator('option').allInnerTexts();
    const later = options.find((option) => !PARTY.includes(option.trim()));
    if (later !== undefined) await after.selectOption({ label: later.trim() });
    await now.getByRole('button', { name: 'Delay the turn', exact: true }).last().click();
    await expect.poll(nameOfNow).not.toBe(before);
  }
  const creature = await nameOfNow();
  expect(PARTY).not.toContain(creature);
  await now
    .getByLabel(`Who runs ${creature}`, { exact: true })
    .selectOption({ label: 'Player of Elowen Starwhisper' });
  await expectAccessible(dm, 'the turn order with a creature handed to a player');

  const card = player.locator('.commanded-turn');
  await expect(card).toBeVisible();
  await expect(card).toContainText('you command it');
  await expectAccessible(player, 'a commanded creature’s turn');
  await card.getByRole('button', { name: 'End its turn', exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect.poll(nameOfNow).not.toBe(creature);
});
