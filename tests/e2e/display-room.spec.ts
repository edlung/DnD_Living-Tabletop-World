import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';

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
 * The table's screen in a room (work-orders/NATIVE_TV_POLISH_2026-11-15.md §1): a scene cast to
 * where the party is follows a fight, and the DM is told when the screens cannot see one; whom the
 * table waits for never covers the turn order; the quiet corner leaves only "Sound on" and a remote
 * reaches it; a screen that lost its network says so and shows the present once it is back; a
 * screen that could not reach the table tries again by itself.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = SIGN_IN_CAMPAIGNS.room;
const CODE = /^[A-HJKMNP-Z2-9]{4} [A-HJKMNP-Z2-9]{4}$/;

async function pairedTv(browser: Browser, dm: Page): Promise<Page> {
  const tv = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  await tv.goto('/display');
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(CODE);
  await openSheet(dm, 'Table screen');
  const screens = dm.locator('#sheet-screen');
  await screens.getByLabel('The screen’s code', { exact: true }).fill(await code.innerText());
  await screens.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(tv.locator('main.display')).toHaveAttribute('data-cast', 'scene');
  return tv;
}

const box = async (page: Page, selector: string) => {
  const found = await page.locator(selector).first().boundingBox();
  if (found === null) throw new Error(`${selector} has no box`);
  return found;
};

test('the screen follows a fight, keeps the turn order clear and survives a lost network', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const dm = await (await browser.newContext()).newPage();
  await joinAsDm(dm, CAMPAIGN);
  const tv = await pairedTv(browser, dm);
  const screen = tv.locator('main.display');
  // Type follows the screen: 16 px at 1080 lines.
  expect(await tv.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('16px');

  // The DM's sheet says what a scene cast to the party does in a fight.
  const form = dm.locator('#sheet-screen').getByRole('region', { name: 'What the screens show' });
  await expect(form).toContainText('While the party fights, the screens show the battlefield');

  // A fight nobody's character takes part in: the screens cannot see it, and the DM is told.
  await openSheet(dm, 'Encounter');
  await dm
    .locator('#sheet-encounter')
    .getByRole('button', { name: 'Start encounter', exact: true })
    .click();
  await openSheet(dm, 'Table screen');
  await expect(form).toContainText('The screens cannot show this fight yet');
  await expect(screen).toHaveAttribute('data-cast', 'scene');

  // A player takes a seat: the party fights, and the screen shows the battlefield by itself.
  const link = await invite(dm, 'Elowen Starwhisper');
  const player = await (await browser.newContext()).newPage();
  await openInvitation(player, joinPath(tokenOf(link)));
  await expect(screen).toHaveAttribute('data-cast', 'battlefield');
  await openSheet(dm, 'Table screen');
  await expect(form).not.toContainText('The screens cannot show this fight yet');

  // The same check asked twice is one line with its count, at the foot, clear of the turn order.
  await openSheet(dm, 'Dice');
  const dice = dm.locator('#sheet-dice');
  for (let asked = 0; asked < 2; asked += 1) {
    await dice
      .getByRole('group', { name: 'Character', exact: true })
      .last()
      .getByRole('radio', { name: 'Elowen Starwhisper', exact: true })
      .check();
    await dice.getByLabel('Check', { exact: true }).last().selectOption({ label: 'Perception' });
    await dice.getByRole('button', { name: 'Ask', exact: true }).click();
  }
  const strip = tv.locator('.display-waiting-strip');
  await expect(strip).toContainText('Elowen Starwhisper');
  await expect(strip.locator('li')).toHaveCount(1);
  await expect(strip).toContainText('×2');
  await expect(strip).toHaveClass(/is-low/);
  // On a wide screen the order of turns is a column at the left and the battlefield takes the
  // screen's height beside it (ADR 0075 §19); the waits stand beside the column, never over it.
  const waits = await box(tv, '.display-waiting-strip');
  const order = await box(tv, '.display-battle .encounter-anchor');
  expect(waits.x).toBeGreaterThanOrEqual(order.x + order.width);
  const field = await box(tv, '.display-battle .display-board');
  expect(field.x).toBeGreaterThanOrEqual(order.x + order.width);
  expect(field.height).toBeGreaterThan(1080 * 0.85);
  // Every row of the column is whole and one portrait high, whoever has a health bar.
  const rows = await tv
    .locator('.display-battle .initiative-entry')
    .evaluateAll((entries) =>
      entries.map((entry) => Math.round(entry.getBoundingClientRect().height)),
    );
  expect(new Set(rows).size).toBe(1);
  const list = await box(tv, '.display-battle .initiative');
  const last = await box(tv, '.display-battle .initiative-entry:last-child');
  expect(last.y + last.height).toBeLessThanOrEqual(list.y + list.height + 1);

  // The quiet corner goes; while sound waits for its press only "Sound on" stays.
  const corner = tv.locator('.display-corner');
  await expect(corner).toHaveClass(/is-idle is-waiting/, { timeout: 10_000 });
  await expect(corner.getByRole('button', { name: 'Sound on', exact: true })).toBeVisible();
  await expect(
    corner.getByRole('button', { name: 'Unpair this screen', exact: true }),
  ).toBeHidden();
  // A remote: an arrow brings focus to the corner, the arrows step, OK presses.
  await tv.keyboard.press('ArrowRight');
  await expect(corner.getByRole('button').first()).toBeFocused();
  await tv.keyboard.press('ArrowRight');
  await expect(corner.getByRole('button').nth(1)).toBeFocused();
  await tv.keyboard.press('ArrowLeft');
  await expect(corner.getByRole('button').first()).toBeFocused();
  // The question keeps focus on its safe answer, and gives it back.
  await corner.getByRole('button', { name: 'Unpair this screen', exact: true }).focus();
  await tv.keyboard.press('Enter');
  await expect(corner.getByRole('button', { name: 'Keep', exact: true })).toBeFocused();
  await tv.keyboard.press('Enter');
  await expect(
    corner.getByRole('button', { name: 'Unpair this screen', exact: true }),
  ).toBeFocused();

  // The network goes: the room is told; the DM casts meanwhile; back, the screen shows the present.
  await tv.context().setOffline(true);
  const plate = tv.locator('.display-link-plate');
  await expect(plate).toContainText('No connection to the table');
  await openSheet(dm, 'Table screen');
  await form.getByRole('radio', { name: 'A title card', exact: true }).check();
  await form.getByLabel('Title', { exact: true }).fill('After the storm');
  await form.getByRole('button', { name: 'Show on the screens', exact: true }).click();
  await expect(form).toContainText('Now: A title card');
  await tv.context().setOffline(false);
  await expect(plate).toHaveCount(0);
  await expect(tv.getByRole('heading', { level: 1, name: 'After the storm' })).toBeVisible({
    timeout: 45_000,
  });
});

test('a screen that cannot reach the table tries again by itself', async ({ browser }) => {
  test.setTimeout(60_000);
  const tv = await (await browser.newContext()).newPage();
  await tv.route('**/api/display/**', (route) => route.abort('failed'));
  await tv.goto('/display');
  await expect(tv.getByRole('alert')).toContainText('The table could not be reached');
  await expect(tv.getByText('The screen tries again by itself.')).toBeVisible();
  await tv.unroute('**/api/display/**');
  // Nobody presses "Try again": the code comes by itself.
  await expect(tv.locator('.display-code')).toHaveText(CODE, { timeout: 25_000 });
});
