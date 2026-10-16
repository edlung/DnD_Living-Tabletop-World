import { expect, test } from '@playwright/test';

import {
  battlefield,
  COMBAT_CAMPAIGNS,
  enterCombat,
  expectAccepted,
  square,
  submit,
  turnTray,
} from './support/combat.ts';
import { expectOnTop } from './support/shell.ts';

/**
 * Below 1200 px the side panel sits under the board, out of view, while the fixed turn tray
 * offers the action (docs/STAGE_320_DESIGN.md §5.5–6): what matters at the moment of choosing
 * shows with the tray's button — a Fireball's slot and the warning that its area includes a
 * party member — in view on a phone and on a tablet, and nothing covers it. The side panel's
 * alert still says it once to assistive technology. The campaign is this journey's own.
 */
const campaign = COMBAT_CAMPAIGNS.narrow;
const WARNING = 'Warning: this area includes a party member. You may still cast it.';

test('a narrow screen shows a Fireball’s slot and its ally warning with the tray’s button', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterCombat(page, campaign);
  // Elowen steps into the area first: the warning must reflect where she really stands.
  await square(page, 6, 5).click();
  expectAccepted(await submit(page, turnTray(page).getByRole('button', { name: 'Move here' })));
  await expect(square(page, 6, 5)).toHaveAccessibleName(/Elowen Starwhisper \(you\)/);

  await square(page, 8, 4).click();
  const fireball = turnTray(page).getByRole('button', {
    name: 'Cast Fireball at Unidentified creature 1',
  });
  await expect(fireball).toBeEnabled();
  const warning = turnTray(page).getByText(WARNING);
  for (const size of [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
  ]) {
    await page.setViewportSize(size);
    await expect(warning, `${String(size.width)} px: the warning is in view`).toBeInViewport();
    await expectOnTop(warning);
    await expect(fireball).toBeInViewport();
    await expect(fireball).toContainText('Level 3 slot');
  }
  // The full description stays beside the board, and its alert is the one announcement.
  const options = battlefield(page).getByRole('region', {
    name: 'Options for Unidentified creature 1',
  });
  await expect(options.getByRole('alert')).toContainText('includes a party member');
  await expect(fireball).toHaveAccessibleDescription(/Level 3 slot.*Would affect:.*Elowen/);
});
