import { expect as baseExpect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import {
  COMBAT_CAMPAIGNS,
  battlefield,
  clickSquare,
  enterCombat,
  expectAccepted,
  square,
  submit,
} from './support/combat.ts';

/**
 * Space on the board (docs/adr/0049-space-and-movement.md §1, §4): Raider 1, made Large, fills
 * four squares from (6, 5), each square naming it; a wall runs along x = 4 with a gap at (4, 6),
 * through which Elowen walks from (2, 6).
 */
const expect = baseExpect.configure({ timeout: 15_000 });

test('a Large raider fills four squares, and Elowen walks through the gap in a wall', async ({
  page,
}) => {
  await enterCombat(page, COMBAT_CAMPAIGNS.space);
  for (const [x, y] of [
    [6, 5],
    [7, 5],
    [6, 6],
    [7, 6],
  ] as const) {
    await expect(square(page, x, y)).toHaveAccessibleName(
      /Unidentified creature 1, hostile, large/,
    );
  }
  await expect(square(page, 4, 5)).toHaveAccessibleName(/: wall/);
  await expect(square(page, 4, 6)).not.toHaveAccessibleName(/wall/);
  await expectAccessible(page, 'the board with a wall and a Large figure');

  await clickSquare(page, 5, 6);
  expectAccepted(await submit(page, battlefield(page).getByRole('button', { name: 'Move here' })));
  await expect(square(page, 5, 6)).toHaveAccessibleName(/Elowen Starwhisper \(you\)/);
});
