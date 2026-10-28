import { expect, test } from '@playwright/test';

import { playerCommand } from './support/authoring.ts';
import { expectAccepted, submit } from './support/combat.ts';
import { historyEntry, openHistory } from './support/dm.ts';
import { expectLive, LIVE_CAMPAIGNS } from './support/live.ts';
import { collectApiBodies, enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * A player's action the DM undoes (second AI stand-in pass; ADR 0033, amendment of 2026-10-28):
 * undoing a day change waits on what the player did since, and the History says that blocker
 * is the player's action, whose and what, and asks before undoing it. The player is told with
 * the next live update, in their own words only; any other view is told nothing.
 */
const campaign = LIVE_CAMPAIGNS.undoNotice;
const DAY = 'Time: Day 1 · 10:00 → Day 2 · 10:00';
const WENT = 'Went to Old Trade Road';

test('the DM confirms undoing a player’s action, and that player alone is told', async ({
  browser,
}) => {
  const player = await browser.newPage();
  const traffic = collectApiBodies(player);
  await enterWorld(player, TOKENS.player, campaign);
  const scene = player.getByRole('region', { name: 'Scene', exact: true });
  await expect(scene.getByRole('heading', { name: 'Market Square', level: 2 })).toBeVisible();
  await expectLive(player);
  const notice = player.getByRole('region', { name: 'Undone by the DM', exact: true });

  const dm = await browser.newPage();
  await enterWorld(dm, TOKENS.dm, campaign);
  await openSheet(dm, 'Time and weather');
  expectAccepted(await submit(dm, dm.getByRole('button', { name: 'Advance to Day 2, 10:00' })));
  // On the new day the player goes on, to the Old Trade Road.
  const road = await playerCommand(player, campaign, 'road', {
    type: 'EnterLocation',
    characterId: 'elowen-starwhisper',
    locationId: 'old-trade-road',
  });
  expect(road.body.status).toBe('accepted');
  await expect(scene.getByRole('heading', { name: 'Old Trade Road', level: 2 })).toBeVisible();

  // The day change waits on the player's action, and History says whose and what it is.
  await openHistory(dm);
  const day = historyEntry(dm, DAY);
  await expect(day).toContainText(`A player’s action (Elowen Starwhisper): ${WENT}`);
  const first = day.getByRole('button', { name: 'Undo the action of Elowen Starwhisper first' });
  await first.click();
  const question = day.getByRole('group', {
    name: `This takes back what the player of Elowen Starwhisper did: ${WENT}. The player will be told. Undo it?`,
  });
  await expect(question.getByRole('button', { name: 'Undo the player’s action' })).toBeFocused();
  // Keeping it changes nothing, and focus returns to the button that asked.
  await question.getByRole('button', { name: 'Keep it' }).click();
  await expect(question).toHaveCount(0);
  await expect(first).toBeFocused();
  await player.waitForTimeout(1_500);
  await expect(notice).toHaveCount(0);

  await first.click();
  await question.getByRole('button', { name: 'Undo the player’s action' }).click();
  await expect(
    dm.getByRole('status').filter({ hasText: 'That step was undone. You can try the undo again.' }),
  ).toBeVisible();
  await expect(day.getByRole('button', { name: 'Undo this change' })).toBeEnabled();

  // The player is told with the next live update, unrefreshed, and is back where they were.
  await expect(notice).toContainText(`The DM undid your action: ${WENT}`);
  await expect(scene.getByRole('heading', { name: 'Market Square', level: 2 })).toBeVisible();
  // The DM's own view of Elowen tells the DM nothing: the action was not the DM's.
  await dm.getByLabel('Perspective', { exact: true }).selectOption('CHARACTER:elowen-starwhisper');
  await expect(dm.getByRole('region', { name: 'Scene', exact: true })).toBeVisible();
  await expect(dm.getByRole('region', { name: 'Undone by the DM', exact: true })).toHaveCount(0);

  // Dismissed, it stays dismissed; the party's and the public view are told nothing.
  await notice.getByRole('button', { name: 'Understood' }).click();
  await expect(notice).toHaveCount(0);
  for (const perspective of ['PARTY', 'PUBLIC']) {
    await player.getByLabel('Perspective', { exact: true }).selectOption(perspective);
    await expect(player.getByRole('region', { name: 'Scene', exact: true })).toBeVisible();
    await expect(notice).toHaveCount(0);
    const other = await player.request.get(`/api/campaigns/${campaign}/undone-actions`, {
      headers: { authorization: `Bearer ${TOKENS.player}` },
      params: { perspective },
    });
    expect(await other.json()).toEqual({ perspective, actions: [] });
  }
  // Back in the player's own view the notice is said again until the player acts on.
  await player.getByLabel('Perspective', { exact: true }).selectOption('PLAYER');
  await expect(notice).toContainText(`The DM undid your action: ${WENT}`);
  // Nothing of the DM's reached the player: no undo, no blocker, no history.
  // (The camp beside the road is perceived there, unnamed, as on any visit.)
  await traffic.assertPlayerBoundary(
    ['UndoCommand', '"blockers"', '"kind":"world"'],
    ['"location-f3b82c8b"'],
  );
  await player.close();
  await dm.close();
});
