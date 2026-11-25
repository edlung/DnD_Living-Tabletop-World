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

  // Whose turn it is and what the DM does about it lie at the map's foot, none of it covered.
  await expect(slip(page)).toBeVisible(LIVE);
  await expect(slip(page)).toContainText('Ходит: Эловен Старвиспер');
  const take = slip(page).getByRole('button', { name: 'Ходить за героя', exact: true });
  const whole = slip(page).getByRole('button', { name: 'Вся схватка', exact: true });
  const end = slip(page).getByRole('button', { name: 'Закончить бой', exact: true });
  for (const control of [take, whole, end]) await expectOnTop(control);
  // The fold-out fits the page: the map ends above the slip, and nothing scrolls the stage.
  const board = await box(page.locator('.board'));
  const foot = await box(slip(page));
  expect(board.y + board.height).toBeLessThanOrEqual(foot.y + 1);
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
  await expect(slip(page)).toContainText('Закончить бой для всех?');
  await slip(page).getByRole('button', { name: 'Продолжить бой', exact: true }).click();
  await expect(slip(page)).not.toContainText('Закончить бой для всех?');
  await end.click();
  expectAccepted(
    await submit(page, slip(page).getByRole('button', { name: 'Да, закончить', exact: true })),
  );
  await expect(slip(page)).toHaveCount(0, LIVE);
  await expect(field(page)).toHaveCount(0);
});

test('a player’s fold-out has no slip of the DM’s', async ({ page }) => {
  await enterWorld(page, TOKENS.player, COMBAT_CAMPAIGNS.hintRu);
  await expect(field(page)).toBeVisible(LIVE);
  await expect(slip(page)).toHaveCount(0);
});
