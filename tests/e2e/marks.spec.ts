import { randomUUID } from 'node:crypto';

import { expect as baseExpect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { battlefield, clickSquare, shownPoint, square } from './support/combat.ts';
import { enterWorld, TOKENS } from './support/session.ts';

/**
 * The table's shared marks (Stage 670c, docs/adr/0057-encounters-maps-loot.md §5): in a fight on
 * the Old Trade Road the DM pings a square, then points at one and moves the pointer — Elowen's
 * player sees it without a refresh, the square's name says so. The DM lets players mark: the player
 * draws a stroke across three squares and shows a laid spell's area to the table, and the DM sees
 * both. The DM clears every mark and takes the marking back.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.marks;

async function startFight(page: Page) {
  const headers = { authorization: `Bearer ${TOKENS.dm}` };
  const base = `/api/campaigns/${CAMPAIGN}/encounters/saved/${randomUUID()}`;
  const saved = await page.request.post(base, {
    headers,
    data: {
      name: 'Marks',
      locationId: 'old-trade-road',
      battlefield: { width: 16, height: 12, difficult: [], cover: [] },
      foes: [{ kind: 'bestiary', monsterId: 'goblin-warrior', position: { x: 15, y: 0 } }],
      partyStart: [
        { x: 0, y: 1 },
        { x: 0, y: 3 },
        { x: 0, y: 5 },
        { x: 0, y: 7 },
      ],
    },
  });
  expect(saved.status()).toBe(201);
  const started = await page.request.post(`${base}/start`, {
    headers,
    data: { requestId: randomUUID() },
  });
  expect(started.status()).toBe(200);
}

/** Lays a mark by a press and waits for the table to take it. */
async function pressMark(page: Page, x: number, y: number): Promise<void> {
  const laid = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/marks') && response.request().method() === 'POST',
  );
  await clickSquare(page, x, y);
  expect((await laid).status()).toBe(201);
}

test('the DM and, when allowed, a player mark the board for the whole table', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await startFight(dm);
  await enterWorld(player, TOKENS.player, CAMPAIGN);
  const dmBoard = battlefield(dm);
  const playerBoard = battlefield(player);
  await dmBoard.getByRole('button', { name: 'Flat board', exact: true }).click();
  await playerBoard.getByRole('button', { name: 'Flat board', exact: true }).click();
  const markButton = (page: Page) =>
    battlefield(page).getByRole('button', { name: 'Mark the board', exact: true });
  // A player marks only when the DM allows.
  await expect(markButton(player)).toHaveCount(0);

  // The DM pings a square: a ring on the board, said once in words.
  await markButton(dm).click();
  const card = (page: Page) => page.locator('.board-tool-card');
  await expect(card(dm)).toContainText('Press a square: every screen at the table sees it.');
  await pressMark(dm, 3, 3);
  await expect(dmBoard.locator('.mark-ping.mark--dm')).toHaveCount(1);
  await expect(dmBoard.getByRole('status').filter({ hasText: 'The DM pings' })).toHaveText(
    'The DM pings: Square 3, 3',
  );
  await expectAccessible(dm, 'the DM’s marks');

  // The pointer: one, moved by pointing again, seen on the player's screen without a refresh.
  await card(dm).getByLabel('Point at a square', { exact: true }).check();
  await pressMark(dm, 5, 5);
  await expect(square(player, 5, 5)).toHaveAccessibleName(/the DM points here/);
  await pressMark(dm, 6, 5);
  await expect(square(player, 6, 5)).toHaveAccessibleName(/the DM points here/);
  await expect(square(player, 5, 5)).not.toHaveAccessibleName(/the DM points here/);
  await expect(playerBoard.locator('.mark-pointer')).toHaveCount(1);

  // The DM lets players mark: the player's board offers it at once.
  await card(dm).getByLabel('Players may mark the board', { exact: true }).check();
  await markButton(player).click();
  await expect(card(player).getByRole('radio')).toHaveCount(2);
  await expect(card(player).getByLabel('Point at a square', { exact: true })).toHaveCount(0);
  await expectAccessible(player, 'a player’s marks');

  // The player draws a stroke across three squares; the DM sees it in the party's colour.
  await card(player).getByLabel('Draw on the board', { exact: true }).check();
  const from = await shownPoint(square(player, 2, 9));
  const to = await shownPoint(square(player, 4, 9));
  const drawn = player.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/marks') && response.request().method() === 'POST',
  );
  await player.mouse.move(from.x, from.y);
  await player.mouse.down();
  await player.mouse.move(to.x, to.y, { steps: 16 });
  await player.mouse.up();
  expect((await drawn).status()).toBe(201);
  await expect(dmBoard.locator('.mark-stroke.mark--player')).toHaveCount(1);

  // A spell's area laid on the player's own board, then shown to the table.
  await playerBoard.getByRole('button', { name: 'A spell’s area', exact: true }).click();
  await clickSquare(player, 10, 6);
  await expect(card(player).getByRole('status')).toHaveText('It covers 81 squares.');
  await card(player).getByRole('button', { name: 'Show it to the table', exact: true }).click();
  await expect(dmBoard.locator('.mark-area.mark--player rect')).toHaveCount(81);

  // The DM clears every mark and takes the marking back.
  await dm.keyboard.press('Escape');
  await markButton(dm).click();
  await card(dm)
    .getByRole('button', { name: /^Clear the marks \(\d+\)$/ })
    .click();
  await expect(dmBoard.locator('.mark-stroke, .mark-area, .mark-pointer')).toHaveCount(0);
  await expect(playerBoard.locator('.mark-stroke, .mark-area, .mark-pointer')).toHaveCount(0);
  await card(dm).getByLabel('Players may mark the board', { exact: true }).uncheck();
  await expect(markButton(player)).toHaveCount(0);
});
