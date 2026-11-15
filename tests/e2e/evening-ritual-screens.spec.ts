import { expect, test, type Browser, type Page } from '@playwright/test';

import boundary from '../../fixtures/ravenford/knowledge-boundary.json' with { type: 'json' };
import { expectAccessible } from './support/axe.ts';
import { holdResponse, isLiveStream } from './support/session.ts';
import { openSheet } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  invite,
  joinAsDm,
  openInvitation,
} from './support/sign-in.ts';

/**
 * "Previously…" on every screen (docs/adr/0071-memory-and-ritual.md §1.4, Stage 710), on the
 * invitation-mode servers, where the table's screen lives: the DM closes an evening with its
 * chapter and keeps the TV paired; the next session opens online with "Previously…" — the TV
 * shows it large, the player's Table screen opens with it, the DM's panel holds the same words
 * to read aloud — and "Show the scene" moves every screen on. The TV received the party's view
 * and nothing more. No trace or screenshot is kept: the pages show links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const LIVE = { timeout: 15_000 };
const FIRST = 'Session 1: Arrival in Ravenford';
const LINE = 'We swore to find the missing caravan.';
const SPACED_CODE = /^[A-HJKMNP-Z2-9]{4} [A-HJKMNP-Z2-9]{4}$/;

const freshPage = async (browser: Browser): Promise<Page> => (await browser.newContext()).newPage();

/** Everything a page received, the live stream aside. */
function collectBodies(page: Page): () => Promise<string> {
  const bodies: Promise<string>[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/api/') && !isLiveStream(response)) {
      bodies.push(response.text().catch(() => ''));
    }
  });
  return async () => (await Promise.all(bodies)).join('\n');
}

test('the next evening opens with “Previously…” on the TV and an online player’s screen', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const campaign = SIGN_IN_CAMPAIGNS.ritual;

  // The TV waits with its code; the DM pairs it.
  const tv = await freshPage(browser);
  const received = collectBodies(tv);
  await tv.goto('/display');
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(SPACED_CODE, LIVE);
  const dm = await freshPage(browser);
  await joinAsDm(dm, campaign);
  await openSheet(dm, 'Table screen');
  const screen = dm.locator('#sheet-screen');
  await screen.getByLabel('The screen’s code', { exact: true }).fill(await code.innerText());
  await screen.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(screen.getByRole('status')).toHaveText(
    'The screen is paired: it shows what you choose below.',
  );

  // A player takes Elowen's seat.
  const link = await invite(dm, 'Elowen Starwhisper');
  const player = await freshPage(browser);
  await openInvitation(player, link);
  await expect(player.locator('nav.dock')).toBeVisible(LIVE);

  // The DM closes the evening with a line of their own and keeps the TV paired.
  await openSheet(dm, 'Session');
  const sheet = dm.locator('#sheet-session');
  await sheet.getByRole('button', { name: 'End the session', exact: true }).click();
  const moments = sheet.getByRole('group', { name: 'The evening’s moments' });
  await moments
    .getByLabel('What mattered most tonight, in your own words (optional)', { exact: true })
    .fill(LINE);
  await sheet.getByRole('checkbox', { name: 'Unpair the table’s screens', exact: true }).uncheck();
  // A narrator takes its time: held, the chapter's answer leaves the sheet saying what goes on,
  // though the session — and the panel that closed it — is already gone from the table.
  const chapter = await holdResponse(dm, (url) =>
    url.pathname.endsWith(`/campaigns/${campaign}/chronicle`),
  );
  await sheet.getByRole('button', { name: 'Yes, end the session', exact: true }).click();
  await chapter.requested;
  await expect(
    sheet.getByRole('status').filter({
      hasText: 'Writing the chapter… A narrator can take a minute or two.',
    }),
  ).toBeVisible(LIVE);
  await expect(sheet.getByRole('button', { name: 'Start the session', exact: true })).toHaveCount(
    0,
  );
  chapter.release();
  const closed = sheet.locator('.session-ended');
  // This server has a narrator (the local provider): whichever prose, the sheet says which.
  await expect(closed).toContainText(/Chapter written( as the plain record: [^.]+)?\./, LIVE);
  await expect(closed).not.toContainText('The table’s screens are unpaired.');
  await expect(player.getByRole('region', { name: 'Previously…' })).toContainText(FIRST, LIVE);

  // The next session opens online with "Previously…".
  await expect(
    sheet.getByRole('checkbox', {
      name: 'Open with “Previously…” on the table’s screen',
      exact: true,
    }),
  ).toBeChecked();
  await sheet.getByRole('radio', { name: 'Online', exact: true }).check();
  await sheet.getByRole('button', { name: 'Start the session', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Pause the game', exact: true })).toBeVisible(
    LIVE,
  );
  await expect(sheet.getByRole('alert')).toHaveCount(0);

  // The TV: the recap, large.
  const recap = tv.locator('.display-chronicle');
  await expect(recap.getByRole('heading', { level: 1, name: FIRST })).toBeVisible(LIVE);
  await expect(recap).toContainText('Previously…');
  await expect(recap.locator('.previously-passage')).not.toHaveCount(0);
  await expectAccessible(tv, 'the recap on the table’s screen');

  // The online player's Table screen opens with the same recap.
  const shared = player.locator('#sheet-shared');
  await expect(shared.getByRole('heading', { level: 1, name: FIRST })).toBeVisible(LIVE);
  await expect(shared).toContainText('Previously…');
  await expectAccessible(player, 'the recap on the player’s Table screen');

  // The DM reads it aloud from the running session's panel, then shows the scene everywhere.
  const aloud = sheet.getByRole('article', { name: FIRST });
  await expect(aloud).toContainText(
    'The table’s screens show this now. Read it aloud, then show the scene.',
    LIVE,
  );
  await expectAccessible(dm, 'the recap to read aloud');
  await aloud.getByRole('button', { name: 'Show the scene', exact: true }).click();
  await expect(sheet.getByRole('article', { name: FIRST })).toHaveCount(0, LIVE);
  // The card went with its button: focus is on the session's own controls, and the sheet says so.
  await expect(sheet.getByRole('button', { name: 'Pause the game', exact: true })).toBeFocused();
  await expect(sheet.getByRole('status')).toContainText('The scene is on the table’s screens.');
  await expect(tv.locator('.display-chronicle')).toHaveCount(0, LIVE);
  await expect(shared.getByRole('heading', { level: 1, name: FIRST })).toHaveCount(0, LIVE);

  // The screen read the party's view only: the DM's line to the party, none of the DM's secrets.
  const bodies = await received();
  expect(bodies).toContain(FIRST);
  for (const marker of boundary.forbiddenMarkers.PARTY) {
    expect(bodies, `the screen received ${marker}`).not.toContain(marker);
  }
});
