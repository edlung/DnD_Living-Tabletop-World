import { expect, test } from '@playwright/test';

import { enterAsDm, propose, review } from './support/authoring.ts';
import { expectAccepted, submit } from './support/combat.ts';
import {
  countWorldReads,
  expectLive,
  LIVE_CAMPAIGNS,
  LIVE_URL,
  liveBadge,
  tablePresence,
} from './support/live.ts';
import { collectApiBodies, enterWorld, TOKENS } from './support/session.ts';

/**
 * The world shared live (docs/adr/0033-live-session.md): what the DM keeps private reaches no
 * player, not even as a signal, and appears without a refresh once published; a cut stream
 * reconnects and catches up. Only the stream's transport is intercepted, to cut it.
 */
const SECRET = 'saw the caravan leave';

test('private authoring reaches the player only once published, without a refresh', async ({
  browser,
}) => {
  const campaign = LIVE_CAMPAIGNS.authoring;
  const player = await browser.newPage();
  const traffic = collectApiBodies(player);
  await enterWorld(player, TOKENS.player, campaign);
  const scene = player.getByRole('region', { name: 'Scene', exact: true });
  await expect(scene.getByRole('heading', { name: 'North Gate' })).toBeVisible();
  const tomas = scene.getByRole('button', { name: /Unidentified npc|Tomas Reed/ });
  const dm = await browser.newPage();
  await enterAsDm(dm, campaign);
  await expectLive(dm);
  await expectLive(player);
  await expect(tablePresence(player)).toContainText('DM connected');
  await player.waitForTimeout(1_500);

  // While the DM drafts, the player is never signalled: nothing is re-read or shown.
  const reads = countWorldReads(player);
  await propose(dm);
  await expect(review(dm)).toContainText('Create npc Tomas Reed at North Gate');
  await review(dm).getByText('Edit proposal', { exact: true }).click();
  await dm.getByLabel('Willing to tell this when asked').check();
  await review(dm).getByRole('button', { name: 'Apply changes' }).click();
  await expect(review(dm).getByText('revision 2')).toBeVisible();
  // More than two comparison cycles.
  await player.waitForTimeout(2_500);
  expect(reads.count(), 'the player re-read nothing while the DM drafted').toBe(0);
  await expect(tomas).toHaveCount(0);

  await review(dm).getByRole('button', { name: 'Confirm and add to the world' }).click();
  await expect(review(dm)).toContainText('Added to the world · revision 2');
  // Published: the player's scene shows him, unrefreshed, without the private account.
  await expect(tomas).toBeVisible();
  expect(reads.count()).toBeGreaterThan(0);
  expect(await player.content()).not.toContain(SECRET);
  await traffic.assertPlayerBoundary([SECRET, 'ApplyAuthoring', 'proposalId']);
  await player.close();
  await dm.close();
});

test('a cut stream reconnects and the player catches up on what changed meanwhile', async ({
  browser,
}) => {
  const campaign = LIVE_CAMPAIGNS.reconnect;
  const player = await browser.newPage();
  await enterWorld(player, TOKENS.player, campaign);
  const conditions = player.getByLabel('Scene conditions');
  await expect(conditions).toContainText('Day 1 · 10:00');
  await expectLive(player);
  // Let the trailing re-read that follows the first load pass (TRAILING_REREAD_MS, 1.5 s), so a
  // change made while the stream is cut can only arrive through the reconnect.
  await player.waitForTimeout(2_000);

  // The connection drops, and every reconnect fails for a while.
  await player.route(LIVE_URL, (route) => route.abort('failed'));
  await player.evaluate(() => {
    window.stop();
  });
  await expect(liveBadge(player)).toHaveText(/Reconnecting…|Offline/);

  const dm = await browser.newPage();
  await enterWorld(dm, TOKENS.dm, campaign);
  await dm.getByText('Time and weather (DM)', { exact: true }).click();
  expectAccepted(await submit(dm, dm.getByRole('button', { name: 'Advance to Day 2, 10:00' })));
  await expect(dm.getByLabel('Scene conditions')).toContainText('Day 2 · 10:00');
  await player.waitForTimeout(1_500);
  await expect(conditions).toContainText('Day 1 · 10:00');

  // The network returns: the next attempt is ready, and ready reloads every view.
  await player.unroute(LIVE_URL);
  await expect(liveBadge(player)).toHaveText('Live updates: Live', { timeout: 20_000 });
  await expect(conditions).toContainText('Day 2 · 10:00');
  await player.close();
  await dm.close();
});
