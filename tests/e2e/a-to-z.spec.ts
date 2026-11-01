import { expect, test } from '@playwright/test';

import {
  battlefield,
  clickWhereShown,
  expectAccepted,
  submit,
  turnTray,
} from './support/combat.ts';
import {
  commandAction,
  enterInvestigation,
  entityDetails,
  travelTo,
} from './support/investigation.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { chooseLocation, closeSheet, openCharacter, openSheet } from './support/shell.ts';

/**
 * The whole game in the browser (Stage 540, work-orders/STAGE_540.md): the Missing Caravan from the
 * player's sign-in to the quest's ending, with the DM at the same table — Mira's account, the site
 * and its evidence, a theory, the accounts against each other, the ambush fought with a die that
 * flies, the return, the truth told to Mira (the Journal says Completed), a long rest and a level.
 * The campaign is a copy of Ravenford with the ambushers waiting on the road
 * (`apps/server/src/testing/ui-a-to-z-campaigns.ts`).
 */
const CAMPAIGN = 'ui-a-to-z';
const SITE_EVIDENCE =
  'Broken wagons and scattered crates fill this roadside clearing; it is where the guild caravan was attacked.';

test('the Missing Caravan from the sign-in to its ending, with dice, a rest and a level', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const player = await (await browser.newContext()).newPage();
  const dm = await (await browser.newContext()).newPage();

  // Ravenford: Mira's account of her caravan begins the quest.
  await enterInvestigation(player, CAMPAIGN);
  await player.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  await commandAction(player, 'Ask about Merchant Guild caravan');
  await expect(entityDetails(player)).toContainText('before dawn');

  // The site on the Old Trade Road, what was left behind, and a theory about it.
  await travelTo(player, 'Old Trade Road');
  await travelTo(player, 'Unidentified location');
  await commandAction(player, 'Inspect');
  await expect(entityDetails(player)).toContainText('Abandoned Caravan Site');
  const scene = player.getByRole('region', { name: 'Scene', exact: true });
  await scene.getByRole('button', { name: 'Unidentified item', exact: true }).last().click();
  await commandAction(player, 'Inspect');
  await commandAction(player, 'Investigate');
  await expect(entityDetails(player)).toContainText('sawn through cleanly');
  await entityDetails(player).getByText('Form a hypothesis', { exact: true }).click();
  await player
    .getByLabel('Hypothesis', { exact: true })
    .fill('The wheel was cut before the attack.');
  await player.getByLabel('Share with', { exact: true }).selectOption({ label: 'Party' });
  await commandAction(player, 'Record hypothesis');

  // Back on the road the ambushers wait: the DM starts the fight.
  await travelTo(player, 'Old Trade Road');
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await chooseLocation(dm, 'old-trade-road');
  await openSheet(dm, 'Encounter');
  expectAccepted(await submit(dm, dm.getByRole('button', { name: 'Start encounter' })));
  await expect(battlefield(player)).toBeVisible({ timeout: 15_000 });

  // Elowen shoots first: the server rolls, the dice fly and land on its numbers.
  // The ambushers stand in a file: on the flat board each square shows whole.
  await battlefield(player).getByRole('button', { name: 'Flat board', exact: true }).click();
  await clickWhereShown(
    player,
    battlefield(player).getByRole('button', { name: /: Unidentified creature 1, hostile/ }),
  );
  const shot = turnTray(player).getByRole('button', {
    name: 'Attack Unidentified creature 1 with longbow',
  });
  expectAccepted(await submit(player, shot));
  await expect(player.locator('.dice-plate')).toContainText('Attack roll', { timeout: 15_000 });
  expectAccepted(await submit(player, turnTray(player).getByRole('button', { name: 'End turn' })));

  // The ambushers break; the DM ends the fight with Elowen standing.
  await dm.getByRole('button', { name: 'End encounter' }).click();
  expectAccepted(await submit(dm, dm.getByRole('button', { name: 'Yes, end encounter' })));
  await expect(battlefield(player)).toHaveCount(0, { timeout: 15_000 });

  // The return to Ravenford, and the truth told to Mira: the party's evidence of her caravan.
  await travelTo(player, 'Market Square');
  await player.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  await entityDetails(player).getByText('More conversation options', { exact: true }).click();
  await entityDetails(player).getByText('Show evidence', { exact: true }).click();
  await player
    .getByLabel('Evidence to show', { exact: true })
    .selectOption({ label: SITE_EVIDENCE });
  await commandAction(player, 'Show selected evidence');

  // The Journal tells the whole quest, and that it is done.
  await openSheet(player, 'Journal');
  const quest = player.locator('#sheet-journal .quest-card');
  await expect(quest).toContainText('Completed');
  for (const step of [
    'We learned that the Merchant Guild caravan never arrived.',
    'We found where the caravan was lost.',
    'We survived an ambush on the Old Trade Road.',
    'We returned to Ravenford.',
    'We told Mira Vale what became of the guild caravan.',
  ]) {
    await expect(quest).toContainText(step);
  }
  await closeSheet(player, 'Journal');

  // A long rest, then a milestone level from the DM; the player's sheet follows.
  await openSheet(dm, 'Time and weather');
  await dm.locator('#sheet-time').getByRole('button', { name: 'Long rest (8 hours)' }).click();
  await expect(dm.getByText('The party rests eight hours', { exact: false })).toBeVisible();
  await closeSheet(dm, 'Time and weather');
  await dm.locator('.rail-member').filter({ hasText: 'Elowen Starwhisper' }).click();
  await dm.getByRole('button', { name: 'Full character sheet' }).click();
  const sheet = await openCharacter(dm, 'Overview');
  await sheet.getByRole('combobox', { name: 'Class to level' }).selectOption({
    label: 'Wizard 8 → 9',
  });
  await sheet.getByRole('button', { name: 'Grant a level' }).click();
  await sheet.getByRole('button', { name: 'Grant Wizard 8 → 9' }).click();
  await expect(dm.getByRole('dialog').getByText('Level 16', { exact: true })).toBeVisible();
  const own = await openCharacter(player, 'Overview');
  await expect(player.getByRole('dialog').getByText('Level 16', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(own.getByText('Wizard 8 → 9')).toHaveCount(0);
});
