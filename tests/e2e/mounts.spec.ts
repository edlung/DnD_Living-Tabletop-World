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
  turnTray,
} from './support/combat.ts';

/**
 * Mounted combat on the board (docs/adr/0049-space-and-movement.md §10): a Large grey worg Elowen
 * commands fills (3, 6)–(4, 7) beside her at (2, 6). She mounts it from her tray; the worg takes
 * her initiative and acts right after her, and on its turn she directs it two squares east, and it
 * carries her.
 */
const expect = baseExpect.configure({ timeout: 15_000 });

test('Elowen mounts the worg she commands, and it carries her where she directs', async ({
  page,
}) => {
  await enterCombat(page, COMBAT_CAMPAIGNS.mount);
  await expect(square(page, 4, 7)).toHaveAccessibleName(/party, large/);
  await clickSquare(page, 4, 7);
  const tray = turnTray(page);
  const mount = tray.getByRole('button', { name: /^Mount / });
  expectAccepted(await submit(page, mount));
  // She rides: the worg's squares name her.
  await expect(square(page, 3, 6)).toHaveAccessibleName(/ridden by Elowen Starwhisper \(you\)/);
  await expect(square(page, 4, 7)).toHaveAccessibleName(/ridden by Elowen Starwhisper \(you\)/);
  await expect(battlefield(page).locator('.token.is-riding')).toHaveCount(1);
  await expectAccessible(page, 'a rider on her mount');
  // A square beside it: she may only get down there, and not twice in one move.
  await clickSquare(page, 2, 5);
  await expect(tray.getByRole('button', { name: 'Dismount here' })).toBeVisible();
  await expect(tray.getByRole('button', { name: 'Move here' })).toHaveCount(0);
  expectAccepted(await submit(page, tray.getByRole('button', { name: 'End turn' })));

  // The worg acts right after her: her player directs it.
  const commanded = battlefield(page).getByRole('region', { name: /’s turn$/ });
  await expect(commanded).toContainText('you command it');
  await clickSquare(page, 5, 6);
  expectAccepted(await submit(page, commanded.getByRole('button', { name: 'Move here' })));
  await expect(square(page, 5, 6)).toHaveAccessibleName(/ridden by Elowen Starwhisper \(you\)/);
  await expect(square(page, 3, 6)).not.toHaveAccessibleName(/Elowen/);
});
