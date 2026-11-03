import { randomUUID } from 'node:crypto';

import { expect as baseExpect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { battlefield, clickSquare, expectAccepted, square, submit } from './support/combat.ts';
import { enterWorld, TOKENS } from './support/session.ts';

/**
 * Traps and harmful ground on the board (Stage 670d, docs/adr/0057-encounters-maps-loot.md §6): in
 * a fight on the Old Trade Road the DM lays a hidden pit two squares east of Elowen and fire near
 * her with the brush. Her player sees the fire and its save, never the pit; on her turn she
 * walks onto it, unknowing, falls in and is told so; the open pit is everyone's to see. (A path
 * that only passes a trap's square stops on it too: the World Engine's tests hold that.)
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.traps;
const ELOWEN = 'elowen-starwhisper';

interface Fight {
  readonly currentCombatantId: string;
  readonly combatants: {
    readonly entity: { readonly entityId: string };
    readonly position: { readonly x: number; readonly y: number };
  }[];
}

async function fightNow(page: Page): Promise<Fight> {
  const response = await page.request.get(`/api/campaigns/${CAMPAIGN}/encounter`, {
    headers: { authorization: `Bearer ${TOKENS.dm}` },
    params: { perspective: 'DM' },
  });
  return ((await response.json()) as { encounter: Fight }).encounter;
}

async function startFight(page: Page) {
  const headers = { authorization: `Bearer ${TOKENS.dm}` };
  const base = `/api/campaigns/${CAMPAIGN}/encounters/saved/${randomUUID()}`;
  const saved = await page.request.post(base, {
    headers,
    data: {
      name: 'Traps',
      locationId: 'old-trade-road',
      battlefield: { width: 16, height: 12, difficult: [], cover: [] },
      foes: [{ kind: 'bestiary', monsterId: 'goblin-warrior', position: { x: 15, y: 0 } }],
      partyStart: [
        { x: 1, y: 1 },
        { x: 1, y: 4 },
        { x: 1, y: 7 },
        { x: 1, y: 10 },
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

/** The DM ends turns until Elowen's comes. */
async function untilElowen(page: Page) {
  for (let turns = 0; turns < 8; turns += 1) {
    const now = await fightNow(page);
    if (now.currentCombatantId === ELOWEN) return;
    const ended = await page.request.post(`/api/campaigns/${CAMPAIGN}/commands`, {
      headers: { authorization: `Bearer ${TOKENS.dm}` },
      data: {
        commandId: `${CAMPAIGN}.end.${String(turns)}`,
        command: { type: 'EndTurn', combatantId: now.currentCombatantId },
      },
    });
    expect(((await ended.json()) as { status: string }).status).toBe('accepted');
  }
  throw new Error('Elowen’s turn never came');
}

test('a hidden pit springs on the player who walks through it; fire shows to all', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await startFight(dm);
  await enterWorld(player, TOKENS.player, CAMPAIGN);
  const elowen = (await fightNow(dm)).combatants.find((one) => one.entity.entityId === ELOWEN);
  if (!elowen) throw new Error('Elowen is not in the fight');
  const { x, y } = elowen.position;
  await expect(square(dm, x, y)).toHaveAccessibleName(/Elowen/);
  for (const page of [dm, player])
    await battlefield(page).getByRole('button', { name: 'Flat board', exact: true }).click();

  // The DM's brush: a hidden pit two squares east, fire a little south-east, clear of plates.
  await dm.getByRole('button', { name: 'Paint the ground', exact: true }).click();
  const card = dm.locator('.paint-card');
  await card.getByRole('radio', { name: 'Trap', exact: true }).check();
  await expect(card.getByLabel('Kind of trap', { exact: true })).toHaveValue('hidden-pit');
  await expect(card.getByLabel('Hidden from the players', { exact: true })).toBeChecked();
  await expectAccessible(dm, 'the trap brush');
  expectAccepted(await submit(dm, square(dm, x + 2, y)));
  await expect(square(dm, x + 2, y)).toHaveAccessibleName(
    /trap: Hidden pit, hidden from the players/,
  );
  await card.getByRole('radio', { name: 'Harmful ground', exact: true }).check();
  await expectAccessible(dm, 'the harmful-ground brush');
  expectAccepted(await submit(dm, square(dm, x + 1, y + 2)));
  await dm.getByRole('button', { name: 'Done painting', exact: true }).first().click();

  // The player sees the fire and its save, never the hidden pit.
  await expect(square(player, x + 1, y + 2)).toHaveAccessibleName(
    /Fire on the ground: 2d6, Dexterity save DC 12, half on a success/,
  );
  await expect(square(player, x + 2, y)).not.toHaveAccessibleName(/trap/);

  // On her turn she walks east onto it, unknowing: the pit opens and she falls in.
  await untilElowen(dm);
  await clickSquare(player, x + 2, y);
  expectAccepted(await submit(player, player.getByRole('button', { name: 'Move here' })));
  await expect(player.getByText(/A trap springs: Hidden pit\./)).toBeVisible();
  await expect(square(player, x + 2, y)).toHaveAccessibleName(/Elowen Starwhisper \(you\)/);
  await expect(square(player, x + 2, y)).toHaveAccessibleName(/trap: Hidden pit, sprung/);
  await expect(square(player, x + 2, y)).toHaveAccessibleName(/a pit 10 ft deep/);
  await expect(square(dm, x + 2, y)).toHaveAccessibleName(/trap: Hidden pit, sprung/);
  await expectAccessible(player, 'the sprung pit');
});
