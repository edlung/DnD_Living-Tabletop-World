import { expect as baseExpect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import {
  clickSquare,
  clickWhereShown,
  expectAccepted,
  shownPoint,
  square,
  submit,
} from './support/combat.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * The DM's encounter builder and hand (Stage 670a, docs/adr/0057-encounters-maps-loot.md §1–2):
 * the DM builds an encounter from the bestiary for the party on the Old Trade Road, sees its
 * difficulty as it grows, moves the ogre and paints a wall on the builder's board (Stage 670b),
 * saves it and starts it in one step; on the board the DM sets a goblin
 * down on another square by choosing it and the square, another by dragging its token, and moves
 * a foe on its own turn as its rules allow.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.encounters;

const encounterSheet = (page: Page) => page.locator('#sheet-encounter');
/** A combatant's name plate: decorative for assistive technology, a press on it picks its square. */
const plate = (page: Page, name: string) =>
  page.locator('.board-plate', { hasText: name }).locator('.token-plate');

interface EncounterRead {
  readonly encounter: {
    readonly currentCombatantId: string;
    readonly combatants: readonly {
      readonly side: string;
      readonly position: { readonly x: number; readonly y: number };
      readonly entity: { readonly entityId: string; readonly kind: string; readonly name: string };
    }[];
  };
}

async function encounterNow(page: Page): Promise<EncounterRead['encounter']> {
  const response = await page.request.get(`/api/campaigns/${CAMPAIGN}/encounter`, {
    headers: { authorization: `Bearer ${TOKENS.dm}` },
    params: { perspective: 'DM' },
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as EncounterRead).encounter;
}

test('the DM builds, saves and starts an encounter, then sets its foes down', async ({ page }) => {
  test.setTimeout(120_000);
  await enterWorld(page, TOKENS.dm, CAMPAIGN);
  await openSheet(page, 'Encounter');
  const mine = encounterSheet(page).getByRole('region', { name: 'Your encounters' });
  await expect(mine).toContainText(
    'Build one from the bestiary: it waits here until you start it.',
  );
  await mine.getByRole('button', { name: 'Build an encounter' }).click();
  const builder = mine.getByRole('form', { name: 'Build an encounter' });
  // Saved without a name or a foe, it says what is missing.
  await builder.getByRole('button', { name: 'Save the encounter' }).click();
  await expect(builder.getByText('Name the encounter.')).toBeVisible();
  await expect(builder.getByText('Add at least one foe.')).toBeVisible();
  await builder.getByLabel('Encounter name', { exact: true }).fill('Goblins at the ford');
  await builder.getByLabel('Place', { exact: true }).selectOption({ label: 'Old Trade Road' });
  const find = builder.getByLabel('Find by name or type', { exact: true });
  const bestiary = builder.getByLabel('From the bestiary', { exact: true });
  await find.fill('goblin warrior');
  await bestiary.selectOption({ label: 'Goblin Warrior (CR 1/4, 50 XP)' });
  await builder.getByRole('button', { name: 'Add', exact: true }).click();
  await builder.getByRole('button', { name: 'One more Goblin Warrior' }).click();
  await expect(builder.locator('.builder-picks')).toContainText('× 2');
  await find.fill('ogre');
  await bestiary.selectOption({ label: 'Ogre (CR 2, 450 XP)' });
  await builder.getByRole('button', { name: 'Add', exact: true }).click();
  // Its difficulty for the four on the road, as the DM builds.
  const difficulty = builder.locator('.encounter-difficulty');
  await expect(difficulty).toContainText('Difficulty: Low. Foes 550 XP');
  await expect(difficulty).toContainText(
    'For Brann Ironvale, Elowen Starwhisper, Maren Ashby, Tamsin Quickfoot.',
  );
  await expectAccessible(page, 'the encounter builder');

  // On the builder's board the ogre is moved by choosing it and a square, and a wall painted.
  const field = builder.getByRole('region', { name: 'The battlefield' });
  const fieldSquare = (x: number, y: number) =>
    field.getByRole('button', { name: new RegExp(`^Square ${String(x)}, ${String(y)}(:|$)`) });
  await expect(fieldSquare(14, 4)).toHaveAccessibleName(/Ogre/);
  await field.locator('.board-plate', { hasText: 'Ogre' }).locator('.token-plate').click();
  await expect(field.getByRole('status')).toHaveText('Choose a square for Ogre, or drag it there.');
  await clickWhereShown(page, fieldSquare(10, 6));
  await expect(fieldSquare(10, 6)).toHaveAccessibleName(/Ogre/);
  await field.getByRole('button', { name: 'Paint the ground', exact: true }).click();
  await clickWhereShown(page, fieldSquare(8, 8));
  await expect(fieldSquare(8, 8)).toHaveAccessibleName(/wall/);
  await expectAccessible(page, 'the builder’s brush');
  await field.locator('.paint-card .primary-button').click();
  await builder.getByRole('button', { name: 'Save the encounter' }).click();
  await expect(builder).toHaveCount(0);
  const row = mine.getByRole('listitem').filter({ hasText: 'Goblins at the ford' });
  await expect(row).toContainText('2 × Goblin Warrior, Ogre');
  await expect(row).toContainText('Difficulty: Low. Foes 550 XP');
  await expectAccessible(page, 'the saved encounters');
  await row.getByRole('button', { name: 'Start: Goblins at the ford', exact: true }).click();
  await expect(
    encounterSheet(page).getByRole('heading', { name: 'Encounter controls (DM)' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(encounterSheet(page)).toBeHidden();
  // The fight stands where the builder put it.
  await expect(square(page, 10, 6)).toHaveAccessibleName(/Ogre/);
  await expect(square(page, 8, 8)).toHaveAccessibleName(/wall/);

  // Goblin Warrior 1 waits in the far corner, its plate over its square: the DM presses the plate,
  // then a square.
  await expect(square(page, 15, 0)).toHaveAccessibleName(/Goblin Warrior 1/);
  await plate(page, 'Goblin Warrior 1').click();
  await clickSquare(page, 6, 3);
  const card = page.locator('.dm-square-card');
  await expect(card).toContainText('The DM’s hand');
  await expectAccessible(page, 'the DM’s hand');
  expectAccepted(
    await submit(page, card.getByRole('button', { name: 'Set Goblin Warrior 1 down here' })),
  );
  await expect(square(page, 6, 3)).toHaveAccessibleName(/Goblin Warrior 1/);
  await expect(square(page, 15, 0)).not.toHaveAccessibleName(/Goblin Warrior/);
  // The world answered and the view refreshed: the hand is empty again.
  await expect(card).toHaveCount(0);

  // Goblin Warrior 2 dragged by its plate across the board.
  await expect(square(page, 15, 2)).toHaveAccessibleName(/Goblin Warrior 2/);
  const grip = await plate(page, 'Goblin Warrior 2').boundingBox();
  if (!grip) throw new Error('no plate');
  const to = await shownPoint(square(page, 9, 8));
  const placed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/commands') &&
      response.request().method() === 'POST',
  );
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  expect(((await (await placed).json()) as { status: string }).status).toBe('accepted');
  await expect(square(page, 9, 8)).toHaveAccessibleName(/Goblin Warrior 2/);
  await expect(card).toHaveCount(0);

  // On a foe's own turn the DM moves it as its rules allow: the characters' turns end first.
  for (let turns = 0; turns < 8; turns += 1) {
    const now = await encounterNow(page);
    const current = now.combatants.find((one) => one.entity.entityId === now.currentCombatantId);
    if (current?.side === 'hostile') break;
    const ended = await page.request.post(`/api/campaigns/${CAMPAIGN}/commands`, {
      headers: { authorization: `Bearer ${TOKENS.dm}` },
      data: {
        commandId: `${CAMPAIGN}.end.${String(turns)}`,
        command: { type: 'EndTurn', combatantId: now.currentCombatantId },
      },
    });
    expect(((await ended.json()) as { status: string }).status).toBe('accepted');
  }
  const now = await encounterNow(page);
  const foe = now.combatants.find((one) => one.entity.entityId === now.currentCombatantId);
  if (foe?.side !== 'hostile') throw new Error('no foe’s turn came');
  const target = { x: foe.position.x - 2, y: foe.position.y };
  await expect(square(page, foe.position.x, foe.position.y)).toHaveAccessibleName(
    new RegExp(foe.entity.name),
  );
  await plate(page, foe.entity.name).click();
  await clickSquare(page, target.x, target.y);
  expectAccepted(await submit(page, card.getByRole('button', { name: 'Move here' })));
  await expect(square(page, target.x, target.y)).toHaveAccessibleName(new RegExp(foe.entity.name));
});
