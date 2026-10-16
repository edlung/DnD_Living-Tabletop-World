import { expect, test, type Page } from '@playwright/test';

import { battlefield, enterCombat } from './support/combat.ts';
import { expectServedPicture, IMAGE_CAMPAIGNS } from './support/images.ts';

/**
 * Every name plate on the battlefield stays readable (docs/STAGE_320_DESIGN.md §5.5; the Stage 330
 * part B review): the approved figures stand nearly two squares tall, and a figure in front once
 * hid the plate — and the number — of a goblin behind it. At 1440 × 900 and on a tablet, tilted
 * and flat, each "Unidentified creature N" plate is the topmost thing at its centre, at both ends
 * and at its number. Read-only: the battle campaign is only looked at.
 */
interface Plate {
  readonly label: string;
  /** What lies over the plate at each point checked, if anything. */
  readonly covered: readonly string[];
}

/** The painted plates (a plate's laid-out room is hidden) and what covers each. */
function readPlates(page: Page): Promise<Plate[]> {
  return page.evaluate(() => {
    // Hit testing finds the topmost painted element only where pointers are let through.
    const style = document.createElement('style');
    style.textContent = '.board-stage * { pointer-events: auto !important; }';
    document.head.append(style);
    try {
      return [...document.querySelectorAll<HTMLElement>('.token-plate')]
        .filter(
          (plate) =>
            getComputedStyle(plate).visibility !== 'hidden' &&
            /^Unidentified creature \d$/.test(plate.textContent.trim()),
        )
        .map((plate) => {
          const box = plate.getBoundingClientRect();
          const middle = box.top + box.height / 2;
          const number = plate.querySelector('.name-number')?.getBoundingClientRect();
          const points: [number, number][] = [
            [box.left + 3, middle],
            [box.left + box.width / 2, middle],
            [box.right - 3, middle],
          ];
          if (number) points.push([number.left + number.width / 2, number.top + number.height / 2]);
          const covered = points.flatMap(([x, y]) => {
            const hit = document.elementFromPoint(x, y);
            return hit !== null && plate.contains(hit) ? [] : [hit?.className.toString() ?? 'none'];
          });
          return { label: plate.textContent.trim(), covered };
        });
    } finally {
      style.remove();
    }
  });
}

async function expectReadable(page: Page, view: string): Promise<void> {
  const plates = await readPlates(page);
  expect(plates.map((plate) => plate.label).sort(), view).toEqual([
    'Unidentified creature 1',
    'Unidentified creature 2',
    'Unidentified creature 3',
    'Unidentified creature 4',
  ]);
  for (const plate of plates) expect(plate.covered, `${view}: ${plate.label}`).toEqual([]);
}

for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 820, height: 1180 },
]) {
  test(`every combatant's name plate is readable at ${size.name} width, tilted and flat`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await enterCombat(page, IMAGE_CAMPAIGNS.battle);
    const board = battlefield(page);
    await expectServedPicture(board.locator('.board-map'));
    for (const [view, pictures] of [
      ['Tilted board', '.token .miniature-art'],
      ['Flat board', '.token .medallion-figure'],
    ] as const) {
      const control = board.getByRole('button', { name: view, exact: true });
      if ((await control.getAttribute('aria-pressed')) !== 'true') await control.click();
      await expect(control).toHaveAttribute('aria-pressed', 'true');
      // Every figure has arrived, so one in front could cover a plate behind it.
      const figures = board.locator(pictures);
      await expect(figures).toHaveCount(5);
      for (const figure of await figures.all()) await expectServedPicture(figure);
      await expectReadable(page, `${size.name} ${view}`);
    }
  });
}
