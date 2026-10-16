import { expect, test } from '@playwright/test';

import {
  anchor,
  battlefield,
  enterCombat,
  expectAccepted,
  expendedSlots,
  square,
  submit,
  turnTray,
} from './support/combat.ts';
import { expectLive, LIVE_CAMPAIGNS, tablePresence, turnBanner } from './support/live.ts';
import { TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * A combat shared live (docs/adr/0033-live-session.md): two browsers on one campaign, and
 * neither ever presses "Refresh world". Each journey owns its campaign
 * (`apps/server/src/testing/ui-live-campaigns.ts`).
 */
const prompt = (page: Parameters<typeof anchor>[0]) =>
  page.getByRole('alertdialog', { name: 'Reaction' });
const total = (slots: readonly number[]) => slots.reduce((a, b) => a + b, 0);

test('the turn passes from the player to the DM and back without a refresh', async ({
  browser,
}) => {
  const campaign = LIVE_CAMPAIGNS.turn;
  const dm = await browser.newPage();
  const player = await browser.newPage();
  await enterCombat(dm, campaign, TOKENS.dm);
  await enterCombat(player, campaign);
  await expectLive(dm);
  await expectLive(player);
  await expect(turnBanner(player)).toHaveText('Your turn');
  await expect(turnBanner(dm)).toHaveText("Elowen Starwhisper's turn");
  // Each sees the other at the table.
  await expect(tablePresence(player)).toContainText('DM connected');
  await expect(tablePresence(dm)).toContainText('Elowen Starwhisper · connected');

  // An unsubmitted DM intent, which no refresh may replace, nor closing its sheet.
  await openSheet(dm, 'Add to the world');
  const intent = dm.getByLabel('Describe what to add', { exact: true });
  await intent.fill('A lantern burns on the wagon.');

  expectAccepted(await submit(player, turnTray(player).getByRole('button', { name: 'End turn' })));
  // The DM's screen follows by itself, offers the creature's suggested turn, keeps the draft.
  await expect(turnBanner(dm)).toHaveText("Goblin Raider's turn");
  await expect(intent).toHaveValue('A lantern burns on the wagon.');
  // The player looks at a square meanwhile; the DM's commands must not close it.
  await square(player, 0, 0).click();
  const options = battlefield(player).getByRole('region', { name: 'Move options' });
  await expect(options).toContainText('You can move on your own turn.');
  await openSheet(dm, 'Encounter');
  for (const tactic of ['attack', 'move', 'end turn']) {
    expectAccepted(await submit(dm, dm.getByRole('button', { name: `Run suggested ${tactic}` })));
  }
  // The player's screen follows the DM's commands by itself, around what it was doing.
  await expect(turnBanner(player)).toHaveText("Unidentified creature 2's turn");
  await expect(anchor(player)).toContainText('Turn: Unidentified creature 2');
  await expect(turnTray(player)).toHaveCount(0);
  await expect(options).toContainText('Square 0, 0');
  await expect(intent).toHaveValue('A lantern burns on the wagon.');
  await player.close();
  await dm.close();
});

test('the DM opens a Counterspell window and the player answers it without a refresh', async ({
  browser,
}) => {
  const campaign = LIVE_CAMPAIGNS.counterspell;
  const player = await browser.newPage();
  const dm = await browser.newPage();
  await enterCombat(player, campaign);
  await enterCombat(dm, campaign, TOKENS.dm);
  await expectLive(player);
  await expectLive(dm);
  await expect(turnBanner(player)).toHaveText("Unidentified creature 4's turn");
  await expect(prompt(player)).toHaveCount(0);
  const before = total(await expendedSlots(player, campaign));

  await openSheet(dm, 'Encounter');
  expectAccepted(await submit(dm, dm.getByRole('button', { name: 'Run suggested spell' })));
  await expect(dm.getByRole('button', { name: 'Close reaction window' })).toBeVisible();
  // The question reaches its player through the signal alone, and says so.
  await expect(prompt(player)).toContainText('Unidentified creature 4 is casting a spell');
  await expect(turnBanner(player)).toHaveText('Your reaction is needed');
  expect(await player.content()).not.toContain('ashen-bolt');
  const countered = await submit(
    player,
    prompt(player).getByRole('button', { name: 'Cast Counterspell' }),
  );
  expectAccepted(countered);
  expect(countered.body.outcome?.kind).toBe('UseReaction');
  await expect(prompt(player)).toHaveCount(0);
  expect(total(await expendedSlots(player, campaign))).toBe(before + 1);
  // The DM sees the window resolved without a refresh.
  await expect(dm.getByRole('button', { name: 'Close reaction window' })).toHaveCount(0);
  await player.close();
  await dm.close();
});
