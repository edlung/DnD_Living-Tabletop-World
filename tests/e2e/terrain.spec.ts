import { expect as baseExpect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import {
  COMBAT_CAMPAIGNS,
  battlefield,
  clickSquare,
  enterCombat,
  expectAccepted,
  playerHp,
  square,
  submit,
  turnTray,
} from './support/combat.ts';

/**
 * Terrain and flight on the board (docs/adr/0049-space-and-movement.md §5–8): a stream at
 * (3, 7)–(4, 7), a pit 10 ft deep at (5, 6). In the terrain campaign Elowen starts on a ledge
 * 10 ft high at (2, 5)–(2, 6); in the flight one she has a Fly Speed of 30 ft; in the Feather Fall
 * one she knows the spell, beside a pit 20 ft deep at (3, 6). The e2e server's dice roll the
 * middle: a d6 is 4.
 */
const expect = baseExpect.configure({ timeout: 15_000 });

test('the board names a stream, a ledge and a pit; Elowen drops off the ledge, then crawls', async ({
  page,
}) => {
  await enterCombat(page, COMBAT_CAMPAIGNS.terrain);
  await expect(square(page, 2, 5)).toHaveAccessibleName(/: raised 10 ft/);
  await expect(square(page, 3, 7)).toHaveAccessibleName(/: water/);
  await expect(square(page, 5, 6)).toHaveAccessibleName(/: a pit 10 ft deep/);
  const legend = battlefield(page).getByRole('region', { name: 'Reading the board' });
  for (const words of ['Water', 'Raised ground', 'Pit'])
    await expect(legend.getByText(words, { exact: true })).toBeVisible();
  await expectAccessible(page, 'the board with a stream, a ledge and a pit');

  // Off the ledge: climbing down costs 25 ft; dropping, 5 ft and a fall of 10.
  await clickSquare(page, 3, 6);
  const tray = turnTray(page);
  await expect(tray.getByRole('button', { name: 'Move here' })).toContainText('about 25 ft');
  const drop = tray.getByRole('button', { name: 'Drop down here' });
  await expect(drop).toContainText('a fall of 10 ft');
  await expect(battlefield(page).getByText(/^Dropping down: a fall of 10 ft/)).toBeVisible();
  expectAccepted(await submit(page, drop));
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'You fall 10 ft and take 4 damage. You are Prone.' }),
  ).toBeVisible();
  await expect(square(page, 3, 6)).toHaveAccessibleName(/Elowen Starwhisper \(you\).*prone/);

  // Prone, she crawls on rather than standing up.
  await clickSquare(page, 4, 6);
  await expect(
    battlefield(page).getByText('Moving stands you up first, for half your Speed.'),
  ).toBeVisible();
  const crawl = tray.getByRole('button', { name: 'Crawl here' });
  await expect(crawl).toContainText('about 10 ft');
  expectAccepted(await submit(page, crawl));
  await expect(square(page, 4, 6)).toHaveAccessibleName(/Elowen Starwhisper \(you\).*prone/);
});

test('Elowen flies up 10 ft and lands on the square beyond', async ({ page }) => {
  await enterCombat(page, COMBAT_CAMPAIGNS.flight);
  const tray = turnTray(page);
  expectAccepted(await submit(page, tray.getByRole('button', { name: 'Fly up 10 ft' })));
  await expect(page.getByRole('status').filter({ hasText: 'You are 10 ft up.' })).toBeVisible();
  await expect(square(page, 2, 6)).toHaveAccessibleName(/Elowen Starwhisper \(you\).*10 ft up/);
  await expect(battlefield(page).locator('.plate-altitude')).toHaveText('↑ 10 ft');

  // At her height to the next square, or down onto it.
  await clickSquare(page, 3, 6);
  await expect(tray.getByRole('button', { name: 'Move here' })).toContainText('about 5 ft');
  const land = tray.getByRole('button', { name: 'Land here' });
  await expect(land).toContainText('about 15 ft');
  expectAccepted(await submit(page, land));
  await expect(square(page, 3, 6)).toHaveAccessibleName(/Elowen Starwhisper \(you\)/);
  await expect(square(page, 3, 6)).not.toHaveAccessibleName(/ft up/);
  await expect(battlefield(page).locator('.plate-altitude')).toHaveCount(0);
});

test('dropping into a pit, Elowen slows her own fall with Feather Fall', async ({ page }) => {
  await enterCombat(page, COMBAT_CAMPAIGNS.featherFall);
  const before = await playerHp(page);
  await clickSquare(page, 3, 6);
  const tray = turnTray(page);
  expectAccepted(await submit(page, tray.getByRole('button', { name: 'Drop down here' })));
  await expect(
    page.getByRole('status').filter({ hasText: 'You fall; a reaction may slow you.' }),
  ).toBeVisible();
  // Her own fall asks her (docs/adr/0049-space-and-movement.md §8).
  const prompt = page.getByRole('alertdialog', { name: 'Reaction: Feather Fall' });
  await expect(prompt).toContainText('Elowen Starwhisper falls 20 ft.');
  await expectAccessible(page, 'the Feather Fall prompt');
  expectAccepted(await submit(page, prompt.getByRole('button', { name: 'Feather Fall' })));
  await expect(
    page.getByRole('status').filter({ hasText: 'Feather Fall: the falling drift down' }),
  ).toBeVisible();
  await expect(prompt).toHaveCount(0);
  expect(await playerHp(page)).toBe(before);
  await expect(square(page, 3, 6)).not.toHaveAccessibleName(/prone/);
});
