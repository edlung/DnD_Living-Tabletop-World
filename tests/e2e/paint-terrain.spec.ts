import { randomUUID } from 'node:crypto';

import { expect as baseExpect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { clickSquare, expectAccepted, shownPoint, square, submit } from './support/combat.ts';
import { historyEntry, openHistory } from './support/dm.ts';
import { enterWorld, TOKENS } from './support/session.ts';

/**
 * The DM's brush (Stage 670b, docs/adr/0057-encounters-maps-loot.md §2): in a fight on the Old
 * Trade Road — the party on the left edge, two goblins and an ogre on the right — the DM raises a
 * wall with a press, drags difficult ground across three squares, raises the ground, clears the
 * wall again, and is refused a wall on a goblin. Elowen's player sees the ground change without a
 * refresh, and the DM's history names each stroke.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.terrain;

/** The fight begun through the DM's saved encounter, its squares known. */
async function startFight(page: Page) {
  const headers = { authorization: `Bearer ${TOKENS.dm}` };
  const base = `/api/campaigns/${CAMPAIGN}/encounters/saved/${randomUUID()}`;
  const saved = await page.request.post(base, {
    headers,
    data: {
      name: 'Goblins at the ford',
      locationId: 'old-trade-road',
      battlefield: { width: 16, height: 12, difficult: [], cover: [] },
      foes: [
        { kind: 'bestiary', monsterId: 'goblin-warrior', position: { x: 15, y: 0 } },
        { kind: 'bestiary', monsterId: 'goblin-warrior', position: { x: 15, y: 2 } },
        { kind: 'bestiary', monsterId: 'ogre', position: { x: 14, y: 4 } },
      ],
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

const brush = (page: Page) => page.locator('.paint-card');

test('the DM paints the running fight’s ground, and the player sees it', async ({ browser }) => {
  test.setTimeout(120_000);
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await startFight(dm);
  await enterWorld(player, TOKENS.player, CAMPAIGN);
  await expect(square(dm, 15, 0)).toHaveAccessibleName(/Goblin Warrior 1/);

  const toggle = dm.getByRole('button', { name: 'Paint the ground', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(brush(dm)).toContainText(
    'Choose a brush, then press a square or drag across several.',
  );
  await expectAccessible(dm, 'the DM’s brush');

  // A wall with a press: the square says so, on the player's screen too.
  expectAccepted(await submit(dm, square(dm, 5, 5)));
  await expect(square(dm, 5, 5)).toHaveAccessibleName(/wall/);
  await expect(square(player, 5, 5)).toHaveAccessibleName(/wall/);

  // Difficult ground dragged across three squares in one stroke.
  await brush(dm).getByLabel('Difficult terrain', { exact: true }).check();
  const from = await shownPoint(square(dm, 6, 8));
  const to = await shownPoint(square(dm, 8, 8));
  const painted = dm.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/commands') &&
      response.request().method() === 'POST',
  );
  await dm.mouse.move(from.x, from.y);
  await dm.mouse.down();
  await dm.mouse.move(to.x, to.y, { steps: 16 });
  await dm.mouse.up();
  expect(((await (await painted).json()) as { status: string }).status).toBe('accepted');
  for (const x of [6, 7, 8])
    await expect(square(dm, x, 8)).toHaveAccessibleName(/difficult terrain/);

  // The ground raised 10 ft, then the wall cleared to bare ground.
  await brush(dm).getByRole('radio', { name: 'Height', exact: true }).check();
  await brush(dm).getByRole('combobox', { name: 'Height' }).selectOption({ label: 'Raised 10 ft' });
  expectAccepted(await submit(dm, square(dm, 10, 3)));
  await expect(square(dm, 10, 3)).toHaveAccessibleName(/raised 10 ft/);
  await brush(dm).getByLabel('Bare ground', { exact: true }).check();
  expectAccepted(await submit(dm, square(dm, 5, 5)));
  await expect(square(dm, 5, 5)).not.toHaveAccessibleName(/wall/);
  await expect(square(player, 5, 5)).not.toHaveAccessibleName(/wall/);

  // No wall rises on a goblin (pressed by its plate, which lies over its square at the board's
  // far edge): the world refuses it and the square stays as it was.
  await brush(dm).getByLabel('Wall', { exact: true }).check();
  const refused = await submit(
    dm,
    dm.locator('.board-plate', { hasText: 'Goblin Warrior 2' }).locator('.token-plate'),
  );
  expect(refused.body.status).toBe('rejected');
  await expect(square(dm, 15, 2)).not.toHaveAccessibleName(/wall/);

  // Done: the brush is put down, and a press chooses a square again.
  await dm.keyboard.press('Escape');
  await expect(brush(dm)).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await clickSquare(dm, 9, 9);
  await expect(dm.locator('.dm-square-card')).toBeVisible();

  // The DM's history names the strokes.
  await openHistory(dm);
  await expect(historyEntry(dm, 'Wall: one square').first()).toBeVisible();
  await expect(historyEntry(dm, 'Difficult terrain: 3 squares')).toBeVisible();
  await expect(historyEntry(dm, 'Raised 10 ft: one square')).toBeVisible();
  await expect(historyEntry(dm, 'Bare ground: one square')).toBeVisible();
});
