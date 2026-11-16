import { expect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { openSheet } from './support/shell.ts';
import { SIGN_IN_CAMPAIGNS, SIGN_IN_ORIGIN, joinAsDm } from './support/sign-in.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * Client error reports from the table's screen (docs/adr/0073-table-ideas.md §1, Stage 800), on
 * the invitation-mode servers, where the table's screen lives: the TV breaks while drawing, shows
 * the plain screen instead of a blank one and reports — the one thing a display writes; the DM's
 * list says it was the table's display. No trace or screenshot is kept: the pages show links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const LIVE = { timeout: 15_000 };
const SPACED_CODE = /^[A-HJKMNP-Z2-9]{4} [A-HJKMNP-Z2-9]{4}$/;

test('the table’s screen breaks: it says so, and the DM reads that it was the display', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const campaign = SIGN_IN_CAMPAIGNS.troubles;

  // The TV waits with its code; the DM pairs it.
  const tv = await freshPage(browser);
  await tv.goto('/display');
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(SPACED_CODE, LIVE);
  const dm = await freshPage(browser);
  await joinAsDm(dm, campaign);
  await openSheet(dm, 'Table screen');
  const screen = dm.locator('#sheet-screen');
  await screen.getByLabel('The screen’s code', { exact: true }).fill(await code.innerText());
  await screen.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(tv.locator('.display-cast')).toBeVisible(LIVE);
  await expect(dm.locator('.trouble-notice')).toHaveCount(0);

  // What the screen is told to show comes back as nothing a screen can draw.
  const sent = tv.waitForRequest(
    (request) => request.url().endsWith('/api/client-errors') && request.method() === 'POST',
    LIVE,
  );
  await tv.route('**/api/campaigns/*/display/cast*', async (route) => {
    const response = await route.fetch();
    return route.fulfill({ response, json: { cast: null, revision: 999 } });
  });
  // The DM casts something else: the TV reads its cast again.
  const form = screen.getByRole('region', { name: 'What the screens show' });
  await form.getByRole('radio', { name: 'The table’s rolls', exact: true }).check();
  await form.getByRole('button', { name: 'Show on the screens', exact: true }).click();

  // A plain screen in place of a blank one.
  const broken = tv.locator('.broken-page');
  await expect(broken.getByRole('heading', { name: 'Something went wrong' })).toBeVisible(LIVE);
  await expect(broken.getByRole('button', { name: 'Load the page again' })).toBeVisible();
  await expectAccessible(tv, 'the table’s screen when it broke');

  // The display's one write: a report that names no campaign — its pairing says which.
  const report = (await sent).postDataJSON() as Record<string, unknown>;
  expect(report).toMatchObject({ kind: 'render', page: 'display', part: 'none' });
  expect(report).not.toHaveProperty('campaignId');

  // The TV has no hand to press the button: it says it will load itself again.
  await expect(broken.getByText('This screen will load itself again in a moment.')).toBeVisible();

  // The DM's list says whose screen it was.
  const notice = dm.locator('.trouble-notice');
  await expect(notice).toBeVisible(LIVE);
  await notice.getByRole('button', { name: 'What broke', exact: true }).click();
  const list = dm.locator('#sheet-session').getByRole('region', { name: 'Screens with an error' });
  const entry = list.locator('.trouble-list li');
  await expect(entry).toHaveCount(1);
  await expect(entry.locator('strong')).toHaveText('The table’s display');
  await expect(entry).toContainText('Where: The table’s display');

  // Loaded again, with the cast mended, the TV shows the table once more.
  await tv.unroute('**/api/campaigns/*/display/cast*');
  await broken.getByRole('button', { name: 'Load the page again' }).click();
  await expect(tv.locator('.display-cast')).toBeVisible(LIVE);
});
