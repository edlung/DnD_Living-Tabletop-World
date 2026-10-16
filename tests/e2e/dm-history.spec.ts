import { expect, test, type Page } from '@playwright/test';

import {
  ADD_TO_THE_WORLD,
  dmRequest,
  propose,
  review,
  TOMAS_REQUEST,
} from './support/authoring.ts';
import { dmHistory, historyEntry, HISTORY_SUMMARY, openHistory } from './support/dm.ts';
import { expectLive, LIVE_CAMPAIGNS } from './support/live.ts';
import { collectApiBodies, enterWorld, TOKENS } from './support/session.ts';
import { chooseLocation, dockButton, openSheet } from './support/shell.ts';

/**
 * The DM history (docs/adr/0033-live-session.md §7): read from the server, so an authoring
 * commit is still listed, and undoable, after a reload; shown only to the DM in the DM
 * perspective, never to a player or in a lower perspective, whose screens hold none of its rows;
 * older pages the DM opened stay open, with their rows, while new entries arrive.
 */
const campaign = LIVE_CAMPAIGNS.history;
const SUMMARY = `Proposed from: ${TOMAS_REQUEST}`;
const tomas = (page: Page) => page.getByRole('button', { name: 'Tomas Reed', exact: true });

/** Counts the page's reads of the DM history from now on. */
function historyReads(page: Page): { count(): number } {
  let reads = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/dm/history')) reads += 1;
  });
  return { count: () => reads };
}

test('an authoring commit is listed after a reload, and its undo works from there', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm, campaign);
  await propose(page);
  await review(page).getByRole('button', { name: 'Confirm and add to the world' }).click();
  await expect(review(page)).toContainText('Added to the world');
  await expect(review(page)).toContainText('To undo it, use History in the DM tools.');

  // A reload forgets the screen and the credential; the history is the server's.
  await page.reload();
  await enterWorld(page, TOKENS.dm, campaign);
  await expectLive(page);
  await openSheet(page, ADD_TO_THE_WORLD);
  await expect(review(page)).toHaveCount(0);
  await openHistory(page);
  const entry = historyEntry(page, SUMMARY);
  await expect(entry).toContainText('Added to the world');
  await expect(entry).toContainText('Authoring');
  await chooseLocation(page, 'north-gate');
  await expect(tomas(page)).toBeVisible();

  await openHistory(page);
  await entry.getByRole('button', { name: 'Undo this addition' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Undone. The world no longer holds this.' }),
  ).toBeVisible();
  await expect(entry).toContainText('Undone');
  await expect(entry.getByRole('button', { name: 'Undo this addition' })).toHaveCount(0);
  await expect(tomas(page)).toHaveCount(0);
});

test('the history never appears for a player or in a lower perspective', async ({ browser }) => {
  const viewed = LIVE_CAMPAIGNS.historyView;
  const dm = await browser.newPage();
  await enterWorld(dm, TOKENS.dm, viewed);
  await openHistory(dm);
  await expect(dmHistory(dm)).toContainText(
    'Nothing yet: authoring commits and actions taken for players appear here.',
  );

  // The DM holding Elowen's or the party's view: no history, no read of it, no row left.
  let reads: { count(): number } | null = null;
  for (const perspective of ['CHARACTER:elowen-starwhisper', 'PARTY']) {
    await dm.getByLabel('Perspective', { exact: true }).selectOption(perspective);
    await expect(dm.getByLabel('Perspective', { exact: true })).toHaveValue(perspective);
    await expect(dm.getByRole('region', { name: 'Scene', exact: true })).toBeVisible();
    await expect(dm.getByText(HISTORY_SUMMARY, { exact: true })).toHaveCount(0);
    await expect(dockButton(dm, 'History')).toHaveCount(0);
    await expect(dmHistory(dm)).toHaveCount(0);
    reads ??= historyReads(dm);
  }
  await expectLive(dm);
  await dm.waitForTimeout(1_500);
  expect(reads?.count(), 'no history is read in a lower perspective').toBe(0);
  const lower = await dm.request.get(`/api/campaigns/${viewed}/dm/history`, {
    headers: { authorization: `Bearer ${TOKENS.dm}` },
    params: { perspective: 'CHARACTER:elowen-starwhisper' },
  });
  expect(lower.status()).toBe(403);

  // Back in the DM perspective, the history is read again from the server.
  await dm.getByLabel('Perspective', { exact: true }).selectOption('DM');
  await openHistory(dm);
  await expect(dmHistory(dm)).toContainText('Nothing yet');
  expect(reads?.count()).toBeGreaterThan(0);

  const player = await browser.newPage();
  const traffic = collectApiBodies(player);
  const playerReads = historyReads(player);
  await enterWorld(player, TOKENS.player, viewed);
  await expectLive(player);
  await expect(player.getByRole('region', { name: 'Scene', exact: true })).toBeVisible();
  for (const perspective of ['PLAYER', 'PARTY', 'PUBLIC']) {
    await player.getByLabel('Perspective', { exact: true }).selectOption(perspective);
    await expect(player.getByText(HISTORY_SUMMARY, { exact: true })).toHaveCount(0);
    await expect(dockButton(player, 'History')).toHaveCount(0);
  }
  await player.waitForTimeout(1_500);
  expect(playerReads.count()).toBe(0);
  expect(await player.content()).not.toContain('History and undo');
  const refused = await player.request.get(`/api/campaigns/${viewed}/dm/history`, {
    headers: { authorization: `Bearer ${TOKENS.player}` },
    params: { perspective: 'DM' },
  });
  expect(refused.status()).toBe(404);
  await traffic.assertPlayerBoundary(['"kind":"authoring"', '"kind":"substitution"']);
  await player.close();
  await dm.close();
});

test('older pages stay open with their rows while new entries arrive', async ({ page }) => {
  const paged = LIVE_CAMPAIGNS.historyPages;
  let walks = 0;
  /** The DM walks Elowen between the square and the gate, with a reason: one more entry. */
  const walk = async () => {
    const clientCommandId = `${paged}.walk-${String(walks)}`;
    const locationId = walks % 2 === 0 ? 'north-gate' : 'market-square';
    walks += 1;
    const reason = await dmRequest(page, paged, 'post', 'dm/substitutions', {
      clientCommandId,
      characterId: 'elowen-starwhisper',
      reason: 'absent',
    });
    expect(reason.status).toBe(201);
    const sent = await dmRequest(page, paged, 'post', 'commands', {
      commandId: clientCommandId,
      command: { type: 'EnterLocation', characterId: 'elowen-starwhisper', locationId },
    });
    expect(sent.body).toMatchObject({ status: 'accepted' });
  };
  // Four pages: 20, 20, 20 and 5 entries.
  for (let index = 0; index < 65; index += 1) await walk();
  await enterWorld(page, TOKENS.dm, paged);
  await expectLive(page);
  await openHistory(page);
  const entries = dmHistory(page).locator('li.dm-history-entry');
  const older = dmHistory(page).getByRole('button', { name: 'Show older', exact: true });
  await expect(entries).toHaveCount(20);
  for (const shown of [40, 60, 65]) {
    await older.click();
    await expect(entries).toHaveCount(shown);
  }
  await expect(older).toHaveCount(0);

  // A new entry moves the cursor of every older page: none starts over, none closes.
  await page.evaluate(() => {
    const seen = { count: 0 };
    Object.assign(window, { historyRestarts: seen });
    new MutationObserver(() => {
      if (document.body.innerText.includes('Reading the history…')) seen.count += 1;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await walk();
  await expect(entries).toHaveCount(66);
  // Each moved page is read again in the background, and the trailing reads follow.
  await page.waitForTimeout(2_500);
  await expect(entries).toHaveCount(66);
  await expect(older).toHaveCount(0);
  const restarts = await page.evaluate(
    () => (window as unknown as { historyRestarts: { count: number } }).historyRestarts.count,
  );
  expect(restarts, 'no open page showed “Reading the history…” again').toBe(0);
});
