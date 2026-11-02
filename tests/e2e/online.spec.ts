import { expect as baseExpect, test, type Locator, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { dockButton, openSheet } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  invite,
  joinAsDm,
  openInvitation,
  tokenOf,
  joinPath,
} from './support/sign-in.ts';

/**
 * Online play (docs/adr/0044-online-play.md §5, plan decision 4): while the session plays online,
 * every player's screen holds the table's screen — what the DM casts, read in the party's view —
 * and follows the DM: a title card opens it. The join card never reaches a player.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = SIGN_IN_CAMPAIGNS.online;

async function cast(
  dm: Page,
  kind: string,
  fill: (form: Locator) => Promise<void> = async () => {},
) {
  await openSheet(dm, 'Table screen');
  const form = dm.locator('#sheet-screen').getByRole('region', { name: 'What the screens show' });
  await form.getByRole('radio', { name: kind, exact: true }).check();
  await fill(form);
  await form.getByRole('button', { name: 'Show on the screens', exact: true }).click();
  await expect(form).toContainText(`Now: ${kind}`);
}

test('online, the table’s screen is on the player’s screen and follows the DM', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const dm = await (await browser.newContext({ baseURL: SIGN_IN_ORIGIN })).newPage();
  await joinAsDm(dm, CAMPAIGN);
  const link = await invite(dm, 'Elowen Starwhisper');
  const player = await (await browser.newContext({ baseURL: SIGN_IN_ORIGIN })).newPage();
  await openInvitation(player, joinPath(tokenOf(link)));
  await expect(player.getByRole('region', { name: 'Scene', exact: true })).toBeVisible();

  // At the table there is a TV: no table's screen on the phone.
  await expect(dockButton(player, 'Table screen')).toHaveCount(0);
  const online = await dm.evaluate(
    (path) =>
      fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'online' }),
      }).then((response) => response.status),
    `/api/campaigns/${CAMPAIGN}/lobby?perspective=DM`,
  );
  expect(online).toBe(204);
  await expect(dockButton(player, 'Table screen')).toBeAttached();

  // The DM shows a title card: the player's table's screen opens with it.
  await cast(dm, 'A title card', async (form) => {
    await form.getByLabel('Title', { exact: true }).fill('Chapter One');
  });
  const shared = player.locator('#sheet-shared');
  await expect(shared).toBeVisible();
  await expect(shared.getByRole('heading', { name: 'Chapter One' })).toBeVisible();
  await expectAccessible(player, 'the table’s screen on a player’s screen');

  // The join card is the TV's only: the player's screen shows nothing then.
  await cast(dm, 'The QR code to join, with “last time”');
  await expect(shared.getByRole('heading', { name: 'Chapter One' })).toHaveCount(0);
  await expect(shared.getByRole('img', { name: /QR code/ })).toHaveCount(0);
});
