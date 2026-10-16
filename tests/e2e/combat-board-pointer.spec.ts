import { expect, test, type Page } from '@playwright/test';

import { battlefield, COMBAT_CAMPAIGNS, enterCombat, square, turnTray } from './support/combat.ts';

/**
 * Pointing at the drawn board (docs/STAGE_320_DESIGN.md §5.5: hit-testing is the same in both
 * views). Tilted on a wide screen, a figure stands upright and rises over the squares behind
 * it: pointing at its portrait chooses that figure's own square — its options, never a move to
 * the square behind — and a condition pip under the pointer names its condition. The campaign
 * is this journey's own: Elowen starts the fight prone (`ui-combat-campaigns.ts`).
 */
const campaign = COMBAT_CAMPAIGNS.board;

/** The visual centre of a figure's portrait: on the tilted board, over the row behind it. */
async function portraitCentre(page: Page, x: number, y: number) {
  const portrait = await square(page, x, y).locator('.token-figure > .medallion').boundingBox();
  const ground = await square(page, x, y).boundingBox();
  if (!portrait || !ground) throw new Error(`Square ${String(x)}, ${String(y)} has no figure`);
  const centre = { x: portrait.x + portrait.width / 2, y: portrait.y + portrait.height / 2 };
  // The pointer goes where the figure stands over another square, not to its own ground.
  expect(centre.y, 'the portrait rises over the squares behind it').toBeLessThan(ground.y);
  return centre;
}

test('a tilted figure is chosen where it stands, and its pip names its condition', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterCombat(page, campaign);
  await expect(page.getByRole('button', { name: 'Tilted board', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // An enemy's portrait: the terrain card reads its square, a click opens its options.
  const raider = await portraitCentre(page, 8, 4);
  await page.mouse.move(raider.x, raider.y);
  const terrain = battlefield(page).locator('.terrain-card');
  await expect(terrain).toContainText('Square 8, 4');
  await expect(terrain).toContainText('Half cover');
  await page.mouse.click(raider.x, raider.y);
  await expect(
    battlefield(page).getByRole('region', { name: 'Options for Unidentified creature 1' }),
  ).toBeVisible();
  await expect(square(page, 8, 4)).toHaveAttribute('aria-pressed', 'true');
  await expect(
    turnTray(page).getByRole('button', { name: 'Attack Unidentified creature 1 with longbow' }),
  ).toBeVisible();

  // Her own portrait: her own square and options, never "Move here" one square back.
  const self = await portraitCentre(page, 2, 6);
  await page.mouse.click(self.x, self.y);
  await expect(
    battlefield(page).getByRole('region', { name: 'Options for Elowen Starwhisper' }),
  ).toBeVisible();
  await expect(square(page, 2, 6)).toHaveAttribute('aria-pressed', 'true');
  await expect(battlefield(page).getByRole('region', { name: 'Move options' })).toHaveCount(0);
  await expect(battlefield(page).getByRole('button', { name: 'Move here' })).toHaveCount(0);

  // Her prone pip takes the pointer, so its tooltip names the condition.
  const pip = square(page, 2, 6).locator('.token-pip');
  await expect(pip).toHaveAttribute('title', 'Prone');
  await pip.hover({ timeout: 5_000 });
  const reached = await pip.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && element.contains(hit);
  });
  expect(reached, 'the pointer reaches the pip').toBe(true);
  // The square keeps its one name, with the condition in words.
  await expect(square(page, 2, 6)).toHaveAccessibleName(
    /^Square 2, 6: Elowen Starwhisper \(you\), party, prone/,
  );
});
