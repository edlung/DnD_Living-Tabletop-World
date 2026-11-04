import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { openSheet } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  invite,
  joinAsDm,
  joinPath,
  openInvitation,
  tokenOf,
} from './support/sign-in.ts';

/**
 * The table screen's moments in the browser (docs/adr/0059-atmosphere.md §4–6; Stage 690d): each
 * cast fades in (with reduced motion, the screen cuts); a new place's title card stands big over
 * its picture for a few seconds; a roll the table may see shows big over the cast, then goes; the
 * dice cast lists the latest rolls with their dice.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = SIGN_IN_CAMPAIGNS.moments;

async function pairedTv(
  browser: Browser,
  dm: Page,
  reducedMotion: 'reduce' | 'no-preference',
  cast: string,
) {
  const tv = await (await browser.newContext({ reducedMotion })).newPage();
  await tv.goto('/display');
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(/^[A-HJKMNP-Z2-9]{4} [A-HJKMNP-Z2-9]{4}$/);
  await openSheet(dm, 'Table screen');
  const screens = dm.locator('#sheet-screen');
  await screens.getByLabel('The screen’s code', { exact: true }).fill(await code.innerText());
  await screens.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(tv.locator('main.display')).toHaveAttribute('data-cast', cast);
  return tv;
}

const animation = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) => getComputedStyle(element).animationName);

test('the table’s screen fades to each cast, names a new place and shows rolls big', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const dm = await (await browser.newContext()).newPage();
  await joinAsDm(dm, CAMPAIGN);
  const tv = await pairedTv(browser, dm, 'no-preference', 'scene');

  // The place's title card, big over its picture, then only the caption.
  const card = tv.locator('.display-place-card');
  await expect(card).toContainText('Market Square');
  expect(await animation(tv, '.display-cast')).toBe('display-fade-in');
  await expect(card).toHaveCount(0, { timeout: 8_000 });
  await expect(tv.getByRole('heading', { level: 1, name: 'Market Square' })).toBeVisible();

  // Another cast fades in.
  const form = dm.locator('#sheet-screen').getByRole('region', { name: 'What the screens show' });
  await form.getByRole('radio', { name: 'A title card', exact: true }).check();
  await form.getByLabel('Title', { exact: true }).fill('Chapter One');
  await form.getByRole('button', { name: 'Show on the screens', exact: true }).click();
  await expect(tv.getByRole('heading', { level: 1, name: 'Chapter One' })).toBeVisible();
  expect(await animation(tv, '.display-cast')).toBe('display-fade-in');

  // A player's roll shows big over the title card, with its dice, then goes.
  const link = await invite(dm, 'Elowen Starwhisper');
  const player = await (await browser.newContext()).newPage();
  await openInvitation(player, joinPath(tokenOf(link)));
  await openSheet(player, 'Dice');
  const sheet = player.locator('#sheet-dice');
  await sheet.getByRole('button', { name: 'Add a d20' }).click();
  await sheet.getByRole('button', { name: 'Roll', exact: true }).click();
  const big = tv.locator('.display-big-roll');
  await expect(big).toContainText('Elowen Starwhisper');
  await expect(big.locator('.display-dice-faces li')).toHaveCount(1);
  await expectAccessible(tv, 'a roll big over the title card');
  await expect(big).toHaveCount(0, { timeout: 10_000 });

  // The dice cast lists the latest rolls with their dice.
  await openSheet(dm, 'Table screen');
  await form.getByRole('radio', { name: 'The table’s rolls', exact: true }).check();
  await form.getByRole('button', { name: 'Show on the screens', exact: true }).click();
  await expect(tv.locator('.display-rolls .display-dice-faces li')).toHaveCount(1);

  // With reduced motion, the screen cuts.
  const still = await pairedTv(browser, dm, 'reduce', 'dice');
  expect(await animation(still, '.display-cast')).toBe('none');
});
