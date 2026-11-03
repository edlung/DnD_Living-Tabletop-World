import { randomUUID } from 'node:crypto';

import { expect as baseExpect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { battlefield, clickSquare, square } from './support/combat.ts';
import { enterWorld, TOKENS } from './support/session.ts';

/**
 * The viewer's own tools on the board (Stage 670c, docs/adr/0057-encounters-maps-loot.md §5): in a
 * fight on the Old Trade Road, Elowen's player measures 25 ft from (2, 2) to (7, 4) — every square
 * 5 ft, diagonals too — lays a 20-ft sphere at (8, 6) over its 81 squares, then a 15-ft cone from
 * Elowen herself, never over her own square. Nothing of it reaches the DM's screen.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.boardTools;

async function startFight(page: Page) {
  const headers = { authorization: `Bearer ${TOKENS.dm}` };
  const base = `/api/campaigns/${CAMPAIGN}/encounters/saved/${randomUUID()}`;
  const saved = await page.request.post(base, {
    headers,
    data: {
      name: 'Tools',
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

/** Elowen's square, as her player's view of the fight has it. */
async function elowenAt(page: Page): Promise<{ x: number; y: number }> {
  const response = await page.request.get(`/api/campaigns/${CAMPAIGN}/encounter`, {
    headers: { authorization: `Bearer ${TOKENS.player}` },
    params: { perspective: 'PLAYER' },
  });
  const body = (await response.json()) as {
    encounter: {
      combatants: { entity: { entityId: string }; position: { x: number; y: number } }[];
    };
  };
  const elowen = body.encounter.combatants.find(
    (one) => one.entity.entityId === 'elowen-starwhisper',
  );
  if (!elowen) throw new Error('Elowen is not in the fight');
  return elowen.position;
}

test('a player measures and lays a spell’s area on her own board', async ({ browser }) => {
  test.setTimeout(120_000);
  const dm = await (await browser.newContext()).newPage();
  const page = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await startFight(dm);
  await enterWorld(page, TOKENS.player, CAMPAIGN);
  const board = battlefield(page);
  await board.getByRole('button', { name: 'Flat board', exact: true }).click();
  const card = page.locator('.board-tool-card');

  // The ruler: 25 ft from (2, 2) to (7, 4), as the rules count.
  await board.getByRole('button', { name: 'Measure', exact: true }).click();
  await expect(card).toContainText('Press where it starts.');
  await clickSquare(page, 2, 2);
  await expect(square(page, 7, 4)).toHaveAccessibleName(/25 ft from the ruler’s start/);
  await clickSquare(page, 7, 4);
  await expect(card.getByRole('status')).toHaveText('25 ft');
  await expect(board.locator('.board-ruler line')).toHaveCount(1);
  await expectAccessible(page, 'the ruler');

  // A 20-ft sphere at (8, 6): 9 squares a side.
  await board.getByRole('button', { name: 'A spell’s area', exact: true }).click();
  await clickSquare(page, 8, 6);
  await expect(card.getByRole('status')).toHaveText('It covers 81 squares.');
  await expect(board.locator('.board-square.in-template')).toHaveCount(81);
  await expectAccessible(page, 'a spell’s area');

  // A 15-ft cone from Elowen, never over her own square.
  const at = await elowenAt(page);
  await card.getByLabel('Cone, from the caster', { exact: true }).check();
  await card.getByLabel('Size', { exact: true }).selectOption({ label: '15 ft' });
  await clickSquare(page, at.x + 3, at.y);
  await expect(square(page, at.x + 1, at.y)).toHaveClass(/in-template/);
  await expect(square(page, at.x, at.y)).not.toHaveClass(/in-template/);

  // Escape puts it away; the DM's board never showed any of it.
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(board.locator('.board-square.in-template')).toHaveCount(0);
  await expect(battlefield(dm).locator('.board-square.in-template, .board-ruler')).toHaveCount(0);
});
