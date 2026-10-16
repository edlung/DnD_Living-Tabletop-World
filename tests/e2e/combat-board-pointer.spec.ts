import { expect, test, type Page } from '@playwright/test';

import { battlefield, COMBAT_CAMPAIGNS, enterCombat, square, turnTray } from './support/combat.ts';
import { expectServedPicture, IMAGE_CAMPAIGNS } from './support/images.ts';

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

/** A point of a name plate drawn over another combatant's figure, and whose plate it is. */
interface PlateOverFigure {
  readonly x: number;
  readonly y: number;
  /** The plate's own combatant's square, by its name ("Square 11, 5"). */
  readonly own: string;
  readonly label: string;
}

/**
 * Looks under every name plate, the plates' layer set aside, for a point where a figure of
 * another square lies beneath it: there the plate is drawn above that figure (Stage 330 part B).
 */
function plateOverFigure(page: Page): Promise<PlateOverFigure | null> {
  return page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>('.board-plates');
    if (!layer) return null;
    const squares = [...document.querySelectorAll<HTMLElement>('.board-square')];
    const plates = [...layer.querySelectorAll<HTMLElement>('.board-plate')].map((plate) => {
      const label = plate.textContent.trim();
      const own = squares.find((button) =>
        (button.getAttribute('aria-label') ?? '').includes(`: ${label},`),
      );
      return { box: plate.getBoundingClientRect(), label, own };
    });
    layer.style.visibility = 'hidden';
    try {
      for (const { box, label, own } of plates) {
        if (!own) continue;
        for (const fy of [0.5, 0.3, 0.7]) {
          for (let fx = 0.08; fx < 0.95; fx += 0.06) {
            const x = box.left + box.width * fx;
            const y = box.top + box.height * fy;
            const under = document.elementFromPoint(x, y);
            const figure = under?.closest('.token-figure');
            const square = under?.closest<HTMLElement>('.board-square');
            if (figure && square && square !== own) {
              const name = /^[^:]+/.exec(own.getAttribute('aria-label') ?? '')?.[0] ?? '';
              return { x, y, own: name, label };
            }
          }
        }
      }
      return null;
    } finally {
      layer.style.visibility = '';
    }
  });
}

/**
 * With the approved figures standing on the tilted board and inside the medallions on the flat
 * one (the image journeys' battle campaign, read-only: choosing a square only reads its
 * options), a figure and its name plate are its own combatant's: the standing figure's body,
 * where it rises over the squares behind, chooses its own square; and a plate — drawn above
 * every figure (Stage 330 part B) — chooses its own combatant where it lies over the figure of
 * one standing in front, never that figure or the square beneath (Stage 320 hit-testing).
 */
test('a standing figure and its name plate choose their own combatant where they show', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterCombat(page, IMAGE_CAMPAIGNS.battle);
  const board = battlefield(page);
  const terrain = board.locator('.terrain-card');

  // The first raider stands upright on the tilted table: the middle of its body chooses it.
  await expect(board.getByRole('button', { name: 'Tilted board', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const figure = square(page, 8, 4).locator('.token .miniature-art');
  await expectServedPicture(figure);
  const body = await figure.boundingBox();
  const ground = await square(page, 8, 4).boundingBox();
  if (!body || !ground) throw new Error('Square 8, 4 has no standing figure');
  const middle = { x: body.x + body.width / 2, y: body.y + body.height * 0.4 };
  expect(middle.y, 'the body rises over the squares behind').toBeLessThan(ground.y);
  await page.mouse.move(middle.x, middle.y);
  await expect(terrain).toContainText('Square 8, 4');
  await page.mouse.click(middle.x, middle.y);
  await expect(square(page, 8, 4)).toHaveAttribute('aria-pressed', 'true');
  await expect(
    board.getByRole('region', { name: 'Options for Unidentified creature 1' }),
  ).toBeVisible();

  for (const [view, pictures] of [
    ['Tilted board', '.token .miniature-art'],
    ['Flat board', '.token .medallion-figure'],
  ] as const) {
    const control = board.getByRole('button', { name: view, exact: true });
    if ((await control.getAttribute('aria-pressed')) !== 'true') await control.click();
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    // Every figure has arrived, so a plate can lie over one.
    await expect(board.locator(pictures)).toHaveCount(5);
    for (const picture of await board.locator(pictures).all()) await expectServedPicture(picture);

    const over = await plateOverFigure(page);
    expect(over, `${view}: a plate lies over the figure of one in front`).not.toBeNull();
    if (!over) continue;
    // Nothing is chosen now: only the press on the plate can choose its combatant.
    await page.keyboard.press('Escape');
    await expect(board.getByRole('region', { name: /^Options for / })).toHaveCount(0);
    // Under the pointer the plate's own square lights, as it does under its figure.
    const own = board.getByRole('button', { name: new RegExp(`^${over.own}:`) });
    await page.mouse.move(over.x, over.y);
    await expect(own, `${view}: the plate's own square is pointed at`).toHaveClass(/is-pointed/);
    await page.mouse.click(over.x, over.y);
    await expect(
      board.getByRole('region', { name: `Options for ${over.label}` }),
      `${view}: the plate's own combatant is chosen`,
    ).toBeVisible();
    await expect(own).toHaveAttribute('aria-pressed', 'true');
  }
});
