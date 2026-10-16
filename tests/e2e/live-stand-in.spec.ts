import { expect, test, type Page } from '@playwright/test';

import {
  battlefield,
  enterCombat,
  expectAccepted,
  square,
  submit,
  turnTray,
} from './support/combat.ts';
import { dmHistory, historyEntry, openHistory } from './support/dm.ts';
import { expectLive, LIVE_CAMPAIGNS, turnBanner } from './support/live.ts';
import { collectApiBodies, TOKENS } from './support/session.ts';
import { dockButton, expectOnTop, openSheet } from './support/shell.ts';

/**
 * The DM acting for an absent player (docs/adr/0033-live-session.md §6): skip the turn, or act
 * as the character after saying why. Presence is shown and decides nothing; the player's screen
 * follows without a refresh; the DM history lists what the DM did, with the reason, and undoes
 * it. Each journey owns its campaign (`apps/server/src/testing/ui-live-campaigns.ts`).
 */
const standIn = (page: Page) => page.getByRole('region', { name: 'Act for a player', exact: true });

/** The DM's encounter controls, in the Encounter sheet. */
const encounterTools = (page: Page) => openSheet(page, 'Encounter');

/** The order of the DM's writes: the reason must reach the server before its command. */
function writes(page: Page): string[] {
  const paths: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') paths.push(new URL(request.url()).pathname);
  });
  return paths;
}

test('the DM skips an absent player’s turn, and the player’s screen follows without a refresh', async ({
  browser,
}) => {
  const campaign = LIVE_CAMPAIGNS.skip;
  const player = await browser.newPage();
  const traffic = collectApiBodies(player);
  const dm = await browser.newPage();
  const sent = writes(dm);
  await enterCombat(player, campaign);
  await enterCombat(dm, campaign, TOKENS.dm);
  await expectLive(player);
  await expectLive(dm);
  await expect(turnBanner(player)).toHaveText('Your turn');
  await expect(turnTray(player).getByRole('button', { name: 'End turn' })).toBeVisible();

  // Her page is open, yet the DM may still judge her away: presence decides nothing.
  await encounterTools(dm);
  await expect(standIn(dm)).toContainText('Elowen Starwhisper · Player connected');
  await standIn(dm).getByRole('button', { name: 'Skip the turn', exact: true }).click();
  const skip = standIn(dm).getByRole('button', { name: 'Skip the turn of Elowen Starwhisper' });
  await expect(skip).toBeDisabled();
  await standIn(dm).getByLabel('The player is absent').check();
  await standIn(dm).getByLabel('Note for the history (optional)').fill('Stepped away for tea');
  expectAccepted(await submit(dm, skip));
  expect(sent.filter((path) => /\/(dm\/substitutions|commands)$/.test(path))).toEqual([
    `/api/campaigns/${campaign}/dm/substitutions`,
    `/api/campaigns/${campaign}/commands`,
  ]);

  // The player's screen follows by itself: the turn has passed.
  await expect(turnBanner(player)).toHaveText("Unidentified creature 1's turn");
  await expect(turnTray(player)).toHaveCount(0);
  await expect(turnBanner(dm)).toHaveText("Goblin Raider's turn");

  await openHistory(dm);
  const entry = historyEntry(dm, 'Acting as Elowen Starwhisper: Ended the turn');
  await expect(entry).toContainText('The player is absent: “Stepped away for tea”');
  await expect(entry).toContainText('In effect');
  await expect(entry.getByRole('button', { name: 'Undo this action' })).toBeEnabled();

  // The reason, and the history itself, never reach the player.
  expect(await player.content()).not.toContain('Stepped away');
  await expect(dmHistory(player)).toHaveCount(0);
  // At the Old Trade Road she perceives the unnamed site nearby (ADR 0012), as in combat-turn.
  await traffic.assertPlayerBoundary(['Stepped away', 'dm/history'], ['"abandoned-caravan-site"']);
  await player.close();
  await dm.close();
});

test('the DM acts as the character with a reason; her screen follows, and the history undoes it', async ({
  browser,
}) => {
  const campaign = LIVE_CAMPAIGNS.actAs;
  const player = await browser.newPage();
  const dm = await browser.newPage();
  await enterCombat(player, campaign);
  await enterCombat(dm, campaign, TOKENS.dm);
  await expectLive(player);
  await expectLive(dm);
  await expect(square(player, 2, 6)).toHaveAccessibleName(/Elowen Starwhisper \(you\)/);
  // She asked the DM to play her turn while she stays at the table.
  await encounterTools(dm);
  await expect(standIn(dm)).toContainText('Elowen Starwhisper · Player connected');
  await standIn(dm).getByRole('button', { name: 'Act as Elowen Starwhisper' }).click();
  await standIn(dm).getByLabel('The player asked the DM').check();
  await standIn(dm).getByLabel('Note for the history (optional)').fill('Back in five');
  await standIn(dm).getByRole('button', { name: 'Start acting as Elowen Starwhisper' }).click();

  // The DM now sees exactly what Elowen sees, with a bar that says so and a way back.
  const bar = dm.getByRole('region', { name: 'Acting for a player', exact: true });
  await expect(bar).toContainText('Acting as Elowen Starwhisper');
  await expect(bar).toContainText('The player asked the DM: “Back in five”');
  await expect(dm.getByLabel('Perspective', { exact: true })).toHaveValue(
    'CHARACTER:elowen-starwhisper',
  );
  await expect(dm.getByText('Add to the world (DM)', { exact: true })).toHaveCount(0);
  await expect(dockButton(dm, 'Add to the world')).toHaveCount(0);
  await expect(turnBanner(dm)).toHaveText('Your turn');

  // Her own combat actions: a step, then a longbow shot. Her player's screen follows.
  await square(dm, 3, 6).click();
  expectAccepted(await submit(dm, battlefield(dm).getByRole('button', { name: 'Move here' })));
  await expect(square(player, 3, 6)).toHaveAccessibleName(/Elowen Starwhisper \(you\)/);
  await square(dm, 8, 4).click();
  await expect(
    battlefield(dm).getByRole('region', { name: 'Options for Unidentified creature 1' }),
  ).toContainText('Attack Unidentified creature 1 with longbow');
  const attacked = await submit(
    dm,
    turnTray(dm).getByRole('button', { name: 'Attack Unidentified creature 1 with longbow' }),
  );
  expectAccepted(attacked);
  expect(attacked.body.outcome?.kind).toBe('Attack');

  await bar.getByRole('button', { name: 'Stop acting' }).click();
  await expect(bar).toHaveCount(0);
  await expect(dm.getByLabel('Perspective', { exact: true })).toHaveValue('DM');
  await openHistory(dm);
  const shot = historyEntry(dm, 'Acting as Elowen Starwhisper: Attacked Goblin Raider');
  const step = historyEntry(dm, 'Acting as Elowen Starwhisper: Moved to 3, 6');
  for (const entry of [shot, step]) {
    await expect(entry).toContainText('The player asked the DM: “Back in five”');
    await expect(entry).toContainText('In effect');
  }
  // The step stands beneath the shot, which read where she stood: the kernel says so.
  await expect(step.getByRole('group', { name: 'Undo blockers' })).toContainText('attack');

  await shot.getByRole('button', { name: 'Undo this action' }).click();
  await expect(
    dm
      .getByRole('status')
      .filter({ hasText: 'Undone. The world is as it was before this action.' }),
  ).toBeVisible();
  await expect(shot).toContainText('Undone');
  await expect(shot.getByRole('button', { name: 'Undo this action' })).toHaveCount(0);
  await expect(step.getByRole('group', { name: 'Undo blockers' })).toHaveCount(0);
  await step.getByRole('button', { name: 'Undo this action' }).click();
  await expect(step).toContainText('Undone');
  // Her player sees her back where she stood, without a refresh, and never the DM's words.
  await expect(square(player, 2, 6)).toHaveAccessibleName(/Elowen Starwhisper \(you\)/);
  expect(await player.content()).not.toContain('Back in five');
  await expect(dmHistory(player)).toHaveCount(0);
  await player.close();
  await dm.close();
});

test('the DM’s skip waits for an open reaction window, and the DM answers it for an absent player', async ({
  browser,
}) => {
  const campaign = LIVE_CAMPAIGNS.skipWindow;
  const player = await browser.newPage();
  const dm = await browser.newPage();
  await enterCombat(player, campaign);
  await enterCombat(dm, campaign, TOKENS.dm);
  await expectLive(player);
  await expectLive(dm);
  await expect(turnBanner(player)).toHaveText('Your turn');

  // Elowen's own spell gives Seren, whose player is away, a chance to counter it.
  await square(player, 8, 4).click();
  await expect(
    battlefield(player).getByRole('region', { name: 'Options for Unidentified creature 1' }),
  ).toContainText('Cast Hunter’s Mark on Unidentified creature 1');
  expectAccepted(
    await submit(
      player,
      turnTray(player).getByRole('button', {
        name: 'Cast Hunter’s Mark on Unidentified creature 1',
      }),
    ),
  );
  await encounterTools(dm);
  await expect(dm.getByRole('button', { name: 'Close reaction window' })).toBeVisible();

  // Skipping Elowen's turn now is refused by the kernel, and the DM is told why.
  const skipElowen = async () => {
    await encounterTools(dm);
    await standIn(dm).getByRole('button', { name: 'Skip the turn', exact: true }).click();
    await standIn(dm).getByLabel('The player is absent').check();
    return submit(
      dm,
      standIn(dm).getByRole('button', { name: 'Skip the turn of Elowen Starwhisper' }),
    );
  };
  const refused = await skipElowen();
  expect(refused.response.status()).toBe(422);
  expect(refused.body).toMatchObject({ status: 'rejected', code: 'REACTION_PENDING' });
  // The refusal shows over the Encounter sheet that caused it, never beneath it.
  await expectOnTop(
    dm.getByRole('status').filter({ hasText: 'The turn cannot end while a reaction is pending.' }),
  );
  await expect(turnBanner(player)).toHaveText('Your turn');

  // The DM answers for Seren, as Seren, then skips Elowen's turn.
  await standIn(dm).getByRole('button', { name: 'Act as Seren Ashgrove' }).click();
  await standIn(dm).getByLabel('The player is absent').check();
  await standIn(dm).getByRole('button', { name: 'Start acting as Seren Ashgrove' }).click();
  const prompt = dm.getByRole('alertdialog', { name: 'Reaction' });
  expectAccepted(
    await submit(dm, prompt.getByRole('button', { name: 'Don’t interfere', exact: true })),
  );
  await dm.getByRole('button', { name: 'Stop acting' }).click();
  expectAccepted(await skipElowen());
  await expect(turnBanner(player)).not.toHaveText('Your turn');

  // The history lists both, each with its reason; the refused skip left nothing behind.
  await openHistory(dm);
  await expect(dmHistory(dm).locator('.dm-history-list > li')).toHaveCount(2);
  await expect(historyEntry(dm, 'Acting as Elowen Starwhisper: Ended the turn')).toContainText(
    'The player is absent',
  );
  await expect(historyEntry(dm, 'Acting as Seren Ashgrove: Let the spell happen')).toContainText(
    'The player is absent',
  );
  await player.close();
  await dm.close();
});
