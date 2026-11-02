import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

import boundary from '../../fixtures/ravenford/knowledge-boundary.json' with { type: 'json' };
import { expectAccessible } from './support/axe.ts';
import { isLiveStream } from './support/session.ts';
import { openSheet, sceneRegion } from './support/shell.ts';
import { SIGN_IN_CAMPAIGNS, SIGN_IN_ORIGIN, WORDS, joinAsDm, takeSeat } from './support/sign-in.ts';

/**
 * The table's screen and the table link in the browser (docs/adr/0042-table-display.md, Stage
 * 610), on the invitation-mode servers: a TV opens /display and shows a code; the DM pairs it on
 * the Table screen sheet; the TV follows the DM's cast — a title card, a place the party does not
 * know (it shows nothing of it), the QR code to join —; two people at the table take free seats,
 * one from the link, one by typing the code the TV shows; the DM sees the seats taken; unpairing
 * sends the TV back to a new code. No trace or screenshot is kept: the pages show links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const words = WORDS.en;
/** Live and multi-browser steps get the time a hosted runner needs (tests/e2e/AGENTS.md). */
const LIVE = { timeout: 15_000 };
const SPACED_CODE = /^[A-HJKMNP-Z2-9]{4} [A-HJKMNP-Z2-9]{4}$/;
const CAMPAIGN_NAME = 'The Missing Caravan';
const SECRET_PLACE = 'Abandoned Caravan Site';

const screenSheet = (page: Page) => page.locator('#sheet-screen');
const players = (page: Page) => page.locator('#sheet-players');
const shown = (tv: Page) => tv.locator('main.display');

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

/** The code a screen shows, as someone reads it off the screen (four, a space, four). */
async function codeOn(tv: Page): Promise<string> {
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(SPACED_CODE, LIVE);
  return code.innerText();
}

/** Everything the screen received, live stream aside: the party's view and nothing more. */
function collectBodies(page: Page): () => Promise<string> {
  const bodies: Promise<string>[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/api/') && !isLiveStream(response)) {
      bodies.push(response.text().catch(() => ''));
    }
  });
  return async () => (await Promise.all(bodies)).join('\n');
}

/** The DM chooses what the screens show, fills the choice's fields, and sends it. */
async function cast(
  dm: Page,
  kind: string,
  fill: (form: Locator) => Promise<void> = () => Promise.resolve(),
): Promise<void> {
  const form = screenSheet(dm).getByRole('region', { name: 'What the screens show' });
  await form.getByRole('radio', { name: kind, exact: true }).check();
  await fill(form);
  await form.getByRole('button', { name: 'Show on the screens', exact: true }).click();
  await expect(form).toContainText(`Now: ${kind}`, LIVE);
}

test('a TV pairs by its code, shows what the DM casts, and the table joins by its link', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const campaign = SIGN_IN_CAMPAIGNS.display;

  // The TV opens the table's screen: a code to type on the DM's screen.
  const tv = await freshPage(browser);
  const received = collectBodies(tv);
  await tv.goto('/display');
  await expect(tv.getByRole('heading', { name: 'The table’s screen', exact: true })).toBeVisible();
  const code = await codeOn(tv);
  await expectAccessible(tv, 'the screen waiting to pair');

  // The DM pairs it on the Table screen sheet, typing the code as people do: lower case.
  const dm = await freshPage(browser);
  await joinAsDm(dm, campaign);
  await openSheet(dm, 'Table screen');
  const sheet = screenSheet(dm);
  await sheet.getByLabel('The screen’s code', { exact: true }).fill('ZZZZ 2222');
  await sheet.getByLabel('Its name (optional)', { exact: true }).fill('Living room');
  await sheet.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(sheet.getByRole('alert')).toHaveText(
    'No screen is waiting with that code. Check it, or let the screen show a new one.',
  );
  await sheet.getByLabel('The screen’s code', { exact: true }).fill(code.toLowerCase());
  await sheet.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText(
    'The screen is paired: it shows what you choose below.',
  );
  await expect(sheet).toContainText('Paired screens: 1 of 4');
  await expect(
    sheet.getByRole('button', { name: 'Unpair: Living room', exact: true }),
  ).toBeVisible();
  await expectAccessible(dm, 'the Table screen sheet');

  // The paired TV shows where the party is, then a title card the DM writes.
  await expect(shown(tv)).toHaveAttribute('data-cast', 'scene', LIVE);
  await expect(tv.getByText('Living room', { exact: true })).toBeVisible();
  await cast(dm, 'A title card', async (form) => {
    await form.getByLabel('Title', { exact: true }).fill('Chapter One');
    await form.getByLabel('Below it (optional)', { exact: true }).fill('The road north');
  });
  await expect(tv.getByRole('heading', { level: 1, name: 'Chapter One' })).toBeVisible(LIVE);
  await expect(tv.getByText('The road north', { exact: true })).toBeVisible();
  await expectAccessible(tv, 'a title card on the screen');

  // A place the party does not know: the screen shows the campaign's name and nothing of it.
  await cast(dm, 'A place’s scene', async (form) => {
    await form.getByLabel('Place', { exact: true }).selectOption({ label: SECRET_PLACE });
  });
  await expect(tv.getByRole('heading', { level: 1, name: CAMPAIGN_NAME })).toBeVisible(LIVE);
  await expect(shown(tv)).toHaveAttribute('data-cast', 'scene');
  expect(await tv.content()).not.toContain(SECRET_PLACE);

  // The DM opens the table link (shown once, with its QR code) and puts its QR code on the TV.
  await openSheet(dm, words.players);
  await players(dm).getByRole('button', { name: 'Open the table link', exact: true }).click();
  const linkField = players(dm).getByLabel('Table link', { exact: true });
  await expect(linkField).toHaveValue(/^http:\/\/127\.0\.0\.1:4312\/table#[A-Za-z0-9_-]{43}$/);
  await expect(
    players(dm).getByRole('img', { name: 'QR code of the table link', exact: true }),
  ).toBeVisible();
  const link = await linkField.inputValue();
  await openSheet(dm, 'Table screen');
  await cast(dm, 'The QR code to join, with “last time”');
  await expect(tv.getByRole('img', { name: 'QR code to join the table', exact: true })).toBeVisible(
    LIVE,
  );
  const tableCode = await codeOn(tv);
  await expectAccessible(tv, 'the QR code to join on the screen');

  // One person scans the QR code: the table's free seats, one taken, then the usual join page.
  const phone = await freshPage(browser);
  await phone.goto(link);
  expect(phone.url()).toBe(`${SIGN_IN_ORIGIN}/`);
  const seats = phone.getByRole('region', { name: 'Choose your character' });
  await expect(
    seats.getByRole('button', { name: 'Play Tamsin Quickfoot', exact: true }),
  ).toBeVisible();
  await expectAccessible(phone, 'the table’s free seats');
  await seats.getByRole('button', { name: 'Play Tamsin Quickfoot', exact: true }).click();
  await takeSeat(phone);
  await expect(sceneRegion(phone)).toBeVisible(LIVE);

  // Another types the code the TV shows; the seat just taken is no longer offered.
  const tablet = await freshPage(browser);
  await tablet.goto('/table');
  await tablet.getByLabel('Table code', { exact: true }).fill(tableCode);
  await tablet.getByRole('button', { name: 'Find the table', exact: true }).click();
  const offered = tablet.getByRole('region', { name: 'Choose your character' });
  await expect(
    offered.getByRole('button', { name: 'Play Maren Ashby', exact: true }),
  ).toBeVisible();
  await expect(offered.getByRole('button', { name: 'Play Tamsin Quickfoot' })).toHaveCount(0);
  await offered.getByRole('button', { name: 'Play Maren Ashby', exact: true }).click();
  await takeSeat(tablet);
  await expect(sceneRegion(tablet)).toBeVisible(LIVE);

  // The DM's Players sheet shows both seats taken through the link.
  await openSheet(dm, words.players);
  const status = players(dm).getByRole('region', { name: 'Table link: every free seat' });
  await expect(status.getByRole('listitem').filter({ hasText: 'Tamsin Quickfoot' })).toContainText(
    'Seat taken',
    LIVE,
  );
  await expect(status.getByRole('listitem').filter({ hasText: 'Maren Ashby' })).toContainText(
    'Seat taken',
  );

  // Whom the table waits for shows over whatever the screen shows (ADR 0044 §3): the DM asks
  // Tamsin, now at the table, for a check; her player's phone asks too; the strip goes when the
  // DM takes the question back.
  await openSheet(dm, 'Table screen');
  await cast(dm, 'A title card', async (form) => {
    await form.getByLabel('Title', { exact: true }).fill('Chapter Two');
  });
  await openSheet(dm, 'Dice');
  const dice = dm.locator('#sheet-dice');
  await dice
    .getByLabel('Character', { exact: true })
    .last()
    .selectOption({ label: 'Tamsin Quickfoot' });
  await dice
    .getByLabel('Check', { exact: true })
    .last()
    .selectOption({ label: 'Dexterity saving throw' });
  await dice.getByRole('button', { name: 'Ask', exact: true }).click();
  const waiting = tv.locator('.display-waiting-strip');
  await expect(waiting).toContainText('Tamsin Quickfoot — Dexterity saving throw', LIVE);
  await expect(tv.getByRole('heading', { level: 1, name: 'Chapter Two' })).toBeVisible();
  await expectAccessible(tv, 'whom the table waits for over a title card');
  await expect(phone.locator('.asked-check')).toContainText('Dexterity saving throw', LIVE);
  await dice.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(waiting).toBeEmpty(LIVE);

  // The screen read the party's view only: none of the DM's secrets reached it.
  const bodies = await received();
  for (const marker of boundary.forbiddenMarkers.PARTY) {
    expect(bodies, `the screen received ${marker}`).not.toContain(marker);
  }
  // It writes nothing, whatever it asks.
  const write = await tv.evaluate(
    (path) =>
      fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cast: { kind: 'blank' } }),
      }).then((response) => response.status),
    `/api/campaigns/${campaign}/display/cast`,
  );
  expect(write).toBe(403);

  // Unpaired by the DM, the TV shows a new code to pair again.
  await openSheet(dm, 'Table screen');
  await sheet.getByRole('button', { name: 'Unpair: Living room', exact: true }).click();
  await expect(sheet).toContainText('No screen is paired yet.', LIVE);
  await expect(tv.getByRole('heading', { name: 'The table’s screen', exact: true })).toBeVisible(
    LIVE,
  );
  expect(await codeOn(tv)).not.toBe(code);
});
