import { expect, type Locator, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { COMBAT_CAMPAIGNS, expectAccepted, submit } from './support/combat.ts';
import { test } from './support/journey.ts';
import { TOKENS, enterWorld } from './support/session.ts';
import { expectOnTop } from './support/shell.ts';

/**
 * The fight run from the map (docs/adr/0075-book-interface.md §17) on the Russian ambush: the
 * DM's turn slip lies at the fold-out's foot — a hero's turn taken with one press and given back
 * when it ends, a creature's suggested turn, the whole Encounter page one press away, "End the
 * fight" on the map. On a tablet the fold-out fits the page: the map is never under a scroll.
 * A player sees no slip.
 */
// Each project runs its own campaign: the fight goes on and ends.
const campaign = () =>
  test.info().project.name === 'ipad' ? COMBAT_CAMPAIGNS.mapIpadRu : COMBAT_CAMPAIGNS.mapRu;
const LIVE = { timeout: 20_000 };

const field = (page: Page) => page.getByRole('region', { name: 'Поле боя', exact: true });
const slip = (page: Page) => page.getByRole('region', { name: 'Ход на карте', exact: true });
const acting = (page: Page) => page.getByRole('region', { name: 'Действие за игрока' });
const tray = (page: Page) => field(page).getByRole('region', { name: 'Действия хода' });
const box = async (locator: Locator) => {
  const found = await locator.boundingBox();
  if (!found) throw new Error('not drawn');
  return found;
};

test('the DM runs a fight from the map: a hero’s turn, a creature’s, the end', async ({ page }) => {
  test.setTimeout(150_000);
  await enterWorld(page, TOKENS.dm, campaign());
  await expect(field(page)).toBeVisible(LIVE);

  // Whose turn it is and what the DM does about it lie on the map beside her figure; ending the
  // fight is a tag at the sheet's lower corner (ADR 0075 §31). None of it is covered.
  await expect(slip(page)).toBeVisible(LIVE);
  await expect(slip(page)).toContainText('Ходит: Эловен Старвиспер');
  const take = slip(page).getByRole('button', { name: 'Ходить за героя', exact: true });
  const whole = slip(page).getByRole('button', { name: 'Вся схватка', exact: true });
  const ending = page.locator('.dm-turn-end');
  const end = ending.getByRole('button', { name: 'Закончить бой', exact: true });
  for (const control of [take, whole, end]) await expectOnTop(control);
  // The sheet fits the window, the slip lies beside the figure, and nothing scrolls the stage.
  const foot = await box(slip(page));
  const figure = await box(
    page.getByRole('button', { name: /^Клетка \d+, \d+: Эловен Старвиспер/ }),
  );
  expect(
    foot.x >= figure.x + figure.width ||
      foot.x + foot.width <= figure.x ||
      foot.y >= figure.y + figure.height ||
      foot.y + foot.height <= figure.y,
    'the slip lies beside her figure, not over it',
  ).toBe(true);
  const viewport = page.viewportSize();
  expect(foot.y + foot.height).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
  expect(
    await page
      .locator('.stage--battle')
      .evaluate((stage) => stage.scrollHeight - stage.clientHeight),
  ).toBeLessThanOrEqual(1);
  await expectAccessible(page, 'the fight’s fold-out with the DM’s turn slip');

  // A hero's turn is taken with one press: her own tray, on the same map. When the turn ends the
  // DM is the DM again, with no "stop acting" to press.
  await take.click();
  await expect(acting(page)).toContainText('Вы действуете за персонажа: Эловен Старвиспер', LIVE);
  await expect(acting(page)).toContainText('Когда ход закончится, вы снова мастер.');
  await expect(tray(page)).toBeVisible(LIVE);
  expectAccepted(
    await submit(page, tray(page).getByRole('button', { name: 'Закончить ход', exact: true })),
  );
  await expect(acting(page)).toHaveCount(0, LIVE);
  await expect(slip(page)).toBeVisible(LIVE);
  await expect(slip(page)).not.toContainText('Ходит: Эловен Старвиспер');

  // A creature's turn: what it would do, in the table's language, and one press to do it.
  await expect(slip(page)).toContainText('Предложенный ход:', LIVE);
  expectAccepted(
    await submit(page, slip(page).getByRole('button', { name: 'Сделать этот ход', exact: true })),
  );

  // The turn order's tools, the light and what joins a fight are one press away, on their page.
  await whole.click();
  const encounter = page.getByRole('region', { name: 'Схватка (мастер)', exact: true });
  await expect(encounter).toBeVisible();
  await expect(encounter).toContainText('Управление схваткой (мастер)');
  await encounter.getByRole('button', { name: /^Закрыть/ }).click();
  await expect(encounter).toBeHidden();

  // "End the fight" asks once, on the map, and ends it for everyone.
  await end.click();
  await expect(ending).toContainText('Закончить бой для всех?');
  // The question takes the focus, on the careful answer, and gives it back to its button.
  const keep = ending.getByRole('button', { name: 'Продолжить бой', exact: true });
  await expect(keep).toBeFocused();
  await expect(ending.getByRole('group', { name: 'Закончить бой для всех?' })).toBeVisible();
  await keep.click();
  await expect(ending).not.toContainText('Закончить бой для всех?');
  await expect(end).toBeFocused();
  await end.click();
  expectAccepted(
    await submit(page, ending.getByRole('button', { name: 'Да, закончить', exact: true })),
  );
  await expect(slip(page)).toHaveCount(0, LIVE);
  await expect(field(page)).toHaveCount(0);
});

/**
 * The fight is the whole screen (docs/adr/0075-book-interface.md §26): in a window some 760 px
 * wide the map takes the sheet — no column of cards stands beside it — and it keeps its size and
 * its place while a figure is chosen, though the card opens and the tray lists what can be done.
 */
test('the map takes the sheet and stands still while a figure is chosen', async ({ page }) => {
  test.skip(test.info().project.name === 'ipad', 'a window’s own width, set in Chromium');
  await page.setViewportSize({ width: 766, height: 799 });
  await enterWorld(page, TOKENS.player, COMBAT_CAMPAIGNS.hintRu);
  await expect(field(page)).toBeVisible(LIVE);
  await expect(tray(page)).toBeVisible(LIVE);
  const plane = page.locator('.board-plane');
  const sheet = await box(page.locator('.stage--battle'));
  const room = await box(page.locator('.board'));
  const before = await box(plane);
  // The board has the sheet's width but for the bookmarks, and the map fills it one way or the other.
  expect(room.width).toBeGreaterThan(sheet.width * 0.8);
  expect(
    Math.max(before.width / room.width, before.height / room.height),
    'the map is as wide or as tall as its room',
  ).toBeGreaterThan(0.85);
  expect(
    await page
      .locator('.stage--battle')
      .evaluate((stage) => stage.scrollHeight - stage.clientHeight),
  ).toBeLessThanOrEqual(1);

  // A foe is chosen: its card lies over the map, the tray lists the ways to act on it.
  await page.locator('.board-square:has(.token--hostile)').first().click();
  await expect(field(page).locator('.combat-side-card')).toBeVisible();
  await expect(tray(page).getByRole('button').nth(1)).toBeVisible();
  expect(await box(plane), 'the map has not moved or changed its size').toEqual(before);
  await expectAccessible(page, 'the whole-screen fight with a figure chosen');
});

test('a player’s fold-out has no slip of the DM’s', async ({ page }) => {
  await enterWorld(page, TOKENS.player, COMBAT_CAMPAIGNS.hintRu);
  await expect(field(page)).toBeVisible(LIVE);
  await expect(slip(page)).toHaveCount(0);
});
