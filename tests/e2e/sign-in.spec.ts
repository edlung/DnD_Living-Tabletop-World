import { expect, test, type Page } from '@playwright/test';

import { dockButton, openSheet } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  START,
  WORDS,
  accessState,
  captureRequests,
  dmToken,
  expectNothingKept,
  expectUnreachable,
  forgedToken,
  heapHoldsAny,
  holdsAny,
  invite,
  joinAsDm,
  joinPath,
  openInvitation,
  takeSeat,
  tokenOf,
} from './support/sign-in.ts';

/**
 * Production sign-in in the browser (docs/adr/0036-production-sign-in.md §7;
 * docs/STAGE_340_DESIGN.md "Browser", "Flows", "Part B review fixes"), on the invitation-mode
 * servers: the DM invites a player, who joins through the link — sent only when they take their
 * seat — and plays; the DM's revocation signs the player out at once, through the live stream; a
 * used, forged or malformed link shows one fixed failure; a browser already signed in is asked
 * before its sign-in is replaced, keeping it first; signing out is final. No token stays in an
 * address, in storage, in Cache Storage, in the page's heap or in any request's URL. Tokens are
 * never printed: no trace or screenshot is kept, and every assertion about a token is yes/no.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const ELOWEN = 'Elowen Starwhisper';
const words = WORDS.en;

const players = (page: Page) => page.locator('#sheet-players');

test('the DM invites, the player joins and plays, and revocation signs the player out at once', async ({
  browser,
}) => {
  const campaign = SIGN_IN_CAMPAIGNS.journey;
  const dmContext = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const dmRequests = captureRequests(dmContext);
  const dm = await dmContext.newPage();
  await joinAsDm(dm, campaign);
  expect(dm.url()).toBe(START);

  // The link is shown once, with its warning, and the copy button puts exactly it on the clipboard.
  const link = await invite(dm, ELOWEN);
  await expect(players(dm)).toContainText('Shown only once.');
  await players(dm).getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(players(dm).getByRole('status').filter({ hasText: 'Copied.' })).toBeVisible();
  expect((await dm.evaluate(() => navigator.clipboard.readText())) === link).toBe(true);

  // The player joins through the link: the world opens, and the address is the start page.
  const playerContext = await browser.newContext();
  const playerRequests = captureRequests(playerContext);
  const player = await playerContext.newPage();
  await player.goto('/');
  await expect(accessState(player, words.none)).toBeVisible();
  await openInvitation(player, link);
  const mira = player.getByRole('button', { name: 'Mira Vale', exact: true });
  await expect(mira).toBeVisible();
  expect(player.url()).toBe(START);
  // Joined: the page holds the token nowhere any more.
  await expectUnreachable(player, [tokenOf(link)]);
  // The joined entry of the history holds the start page too, not the link.
  await player.goBack();
  expect(player.url()).toBe(START);
  await player.goForward();
  expect(player.url()).toBe(START);
  await expect(mira).toBeVisible();

  // The player plays: a command sent with the session cookie.
  await mira.click();
  const details = player.getByRole('complementary', { name: 'Entity details' });
  const asked = player.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/commands') &&
      response.request().method() === 'POST',
  );
  await details.getByRole('button', { name: 'Ask about Merchant Guild caravan' }).click();
  expect((await asked).status()).toBe(200);
  await expect(details).toContainText('before dawn');

  // The DM sees the player at the table, signed in, and the link's invitation used.
  const members = players(dm).getByRole('region', { name: words.members });
  await expect(members.getByRole('listitem').filter({ hasText: ELOWEN })).toContainText(
    'Signed in',
  );
  await expect(players(dm).getByLabel(words.link, { exact: true })).toHaveCount(0);
  await expect(players(dm)).toContainText(`The invitation for ${ELOWEN} was used`);

  // Quiet: no read of the player's is pending (each read is followed by one more 1.5 s later),
  // so only the live stream can carry the news: no other request reaches the server meanwhile.
  await player.waitForTimeout(3_000);
  let reads = 0;
  let accountReads = 0;
  player.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    // The signed-out screen asks once whether a login is still signed in here (Stage 600).
    if (path === '/api/account') accountReads += 1;
    else if (path.startsWith('/api/') && !path.endsWith('/live')) reads += 1;
  });
  await members.getByRole('button', { name: words.revoke(ELOWEN) }).click();
  await members.getByRole('button', { name: words.revokeYes }).click();
  await expect(players(dm)).toContainText(
    `The player of ${ELOWEN} is signed out, and ${ELOWEN} can be invited again.`,
  );
  await expect(accessState(player, words.signedOut)).toBeVisible({ timeout: 10_000 });
  await expect(mira).toHaveCount(0);
  expect(reads, 'reads the player sent before the signed-out screen').toBe(0);
  expect(accountReads, 'the signed-out screen asks about a login once').toBeLessThanOrEqual(1);
  // The seat is free again.
  await expect(
    players(dm).getByLabel(words.character, { exact: true }).getByRole('option', { name: ELOWEN }),
  ).toHaveCount(1);

  const tokens = [tokenOf(link), dmToken(campaign)];
  dmRequests.expectTokensOnlyInRedeems(tokens);
  playerRequests.expectTokensOnlyInRedeems(tokens);
  await expectNothingKept(dm, tokens);
  await expectNothingKept(player, tokens);
  await dmContext.close();
  await playerContext.close();
});

test('an invitation link sends nothing until the person takes the seat', async ({ browser }) => {
  const token = dmToken(SIGN_IN_CAMPAIGNS.onClick);
  // A link scanner, a history suggestion or another site opening the link stops at the question.
  const scanner = await browser.newContext();
  const scanned = captureRequests(scanner);
  const opened = await scanner.newPage();
  await opened.goto(joinPath(token));
  const invited = accessState(opened, words.invited);
  await expect(invited).toContainText('Nothing is used until you take your seat.');
  expect(opened.url()).toBe(START);
  await opened.waitForTimeout(1_500);
  const api = scanned.sent.filter((request) => new URL(request.url).pathname.startsWith('/api/'));
  expect(api.length, 'requests before the seat is taken').toBe(0);
  // A reload is the start page: the link was taken out of the address, not spent.
  await opened.reload();
  await expect(accessState(opened, words.none)).toBeVisible();
  await scanner.close();

  // The person opens the same link, unused, and takes the seat: one redeem, then the world.
  const context = await browser.newContext();
  const requests = captureRequests(context);
  const page = await context.newPage();
  await page.goto(joinPath(token));
  await expect(accessState(page, words.invited)).toBeVisible();
  const redeems = () =>
    requests.sent.filter((request) => request.url === `${SIGN_IN_ORIGIN}/api/auth/redeem`).length;
  expect(redeems(), 'redeems before the click').toBe(0);
  // The checks find the token while the page holds it for the person: in its heap, and in the
  // navigation entry the browser keeps (why a join page gives way to a fresh start page).
  expect(await heapHoldsAny(page, [token]), 'held while the page waits').toBe(true);
  const timing = await page.evaluate(() =>
    performance
      .getEntriesByType('navigation')
      .map((entry) => entry.name)
      .join(' '),
  );
  expect(holdsAny(timing, [token]), 'the join page’s navigation entry').toBe(true);
  await takeSeat(page);
  await expect(dockButton(page, words.players)).toBeVisible();
  expect(redeems(), 'redeems after the click').toBe(1);
  requests.expectTokensOnlyInRedeems([token]);
  await expectUnreachable(page, [token]);
  await expectNothingKept(page, [token]);
  await context.close();
});

test('a used, forged or malformed link shows the one fixed failure and opens nothing', async ({
  browser,
}) => {
  const campaign = SIGN_IN_CAMPAIGNS.failures;
  const dm = await browser.newPage();
  await joinAsDm(dm, campaign);
  const link = await invite(dm, ELOWEN);
  const first = await browser.newPage();
  await openInvitation(first, link);
  await expect(first.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible();

  const said = new Set<string>();
  const forged = forgedToken();
  for (const path of [link, joinPath(forged), '/join#not-a-token', joinPath(dmToken(campaign))]) {
    const page = await browser.newPage();
    // A malformed link fails at once, without a request; the others when the seat is taken.
    if (path === '/join#not-a-token') await page.goto(path);
    else await openInvitation(page, path);
    const failure = accessState(page, words.failed);
    await expect(failure).toBeVisible();
    said.add(await failure.innerText());
    expect(page.url()).toBe(START);
    await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toHaveCount(0);
    // Failed: the page holds the token nowhere any more.
    if (path === joinPath(forged)) await expectUnreachable(page, [forged]);
    await page.context().close();
  }
  expect(said.size, 'one fixed failure, whatever the reason').toBe(1);

  // Back to the start: a browser without a session is asked for an invitation.
  const page = await browser.newPage();
  await openInvitation(page, joinPath(forgedToken()));
  await page.getByRole('button', { name: 'Back to the start' }).click();
  await expect(accessState(page, words.none)).toBeVisible();
});

test('a browser already signed in is asked before an invitation replaces its sign-in', async ({
  browser,
}) => {
  const campaign = SIGN_IN_CAMPAIGNS.replace;
  const dm = await browser.newPage();
  await joinAsDm(dm, campaign);
  const link = await invite(dm, ELOWEN);
  const question = accessState(dm, words.replaceQuestion);
  const keep = question.getByRole('button', { name: words.keep });
  const replace = question.getByRole('button', { name: words.replace });

  // Keeping the current sign-in is the first, primary and focused choice; replacing waits.
  await openInvitation(dm, link);
  await expect(question).toContainText('You are signed in to “The Missing Caravan” as the DM.');
  await expect(question).toContainText(
    'To come back to that table as the DM, you will need a new invitation link from the operator.',
  );
  expect(dm.url()).toBe(START);
  await expect(keep).toBeFocused();
  await expect(question.getByRole('button')).toHaveText([words.keep, words.replace]);
  await expect(keep).toHaveClass(/primary-button/);
  await expect(replace).toBeDisabled();
  // A press on the unavailable choice does nothing; Enter keeps the sign-in.
  await replace.dispatchEvent('click');
  await expect(question).toBeVisible();
  await dm.keyboard.press('Enter');
  await expect(dockButton(dm, words.players)).toBeVisible();
  // Kept: the invitation stays unused, and the page holds its token nowhere.
  await expectUnreachable(dm, [tokenOf(link)]);
  await expectNothingKept(dm, [tokenOf(link)]);
  await openSheet(dm, words.players);
  const waiting = players(dm)
    .getByRole('region', { name: words.invitations })
    .getByRole('listitem')
    .filter({ hasText: ELOWEN });
  await expect(waiting).toContainText('Waiting to be used');

  // Replacing waits until the page has been shown for a moment and the person pointed or
  // pressed a key since the question appeared: then it signs this browser in as the player.
  await openInvitation(dm, link);
  await expect(keep).toBeFocused();
  await dm.waitForTimeout(1_000);
  await expect(replace, 'without a pointer or key since the question appeared').toBeDisabled();
  await dm.keyboard.press('Tab');
  await expect(replace).toBeFocused();
  await expect(replace).toBeEnabled();
  await dm.keyboard.press('Enter');
  await expect(dm.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible();
  await expect(dockButton(dm, words.players)).toHaveCount(0);
  await expect(dm.getByLabel('Perspective', { exact: true })).not.toContainText('Dungeon Master');

  // The seat is taken: the DM, back with a new link, finds the player at the table.
  const again = await browser.newPage();
  await joinAsDm(again, campaign, 1);
  await openSheet(again, words.players);
  await expect(
    players(again).getByRole('region', { name: words.members }).getByRole('listitem'),
  ).toContainText(ELOWEN);
});

test('signing out asks first, ends the session for good, and keeps nothing', async ({
  browser,
}) => {
  const campaign = SIGN_IN_CAMPAIGNS.signOut;
  const page = await browser.newPage();
  await joinAsDm(page, campaign);
  const leave = page.getByRole('button', { name: words.signOut, exact: true });

  // Staying keeps the session; Escape is staying too, and focus returns to the button.
  await leave.click();
  const dialog = page.getByRole('dialog', { name: words.signOutQuestion });
  await expect(dialog).toContainText('You will need a new invitation link');
  await dialog.getByRole('button', { name: words.stay }).click();
  await expect(dialog).toBeHidden();
  await leave.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(leave).toBeFocused();
  await expect(dockButton(page, words.players)).toBeVisible();

  await leave.click();
  await dialog.getByRole('button', { name: words.signOut, exact: true }).click();
  await expect(accessState(page, words.signedOut)).toBeVisible();
  await expect(dockButton(page, words.players)).toHaveCount(0);
  const probe = await page.evaluate(async () => (await fetch('/api/auth/session')).status);
  expect(probe).toBe(401);
  await page.reload();
  await expect(accessState(page, words.none)).toBeVisible();
  await expectNothingKept(page, [dmToken(campaign)]);
});

test('joining, the Players sheet and signing out work from the keyboard', async ({ browser }) => {
  const page = await browser.newPage();
  // A link: Tab reaches the choice of how to come back, arrows choose "Only this browser", Tab
  // reaches "Take your seat". It fails: its title takes focus, Tab reaches what next.
  await page.goto(joinPath(forgedToken()));
  // The client renders the join page after it loads (slowly on hosted runners): Tab waits for it.
  const takeSeat = page.getByRole('button', { name: words.takeSeat });
  await expect(takeSeat).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('radio', { name: 'Create a login', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: words.onlyBrowser, exact: true })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(takeSeat).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: words.failed })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Back to the start' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(accessState(page, words.none)).toBeVisible();

  // The DM opens the Players sheet from the dock and creates a link without a pointer.
  await joinAsDm(page, SIGN_IN_CAMPAIGNS.keyboard);
  const dock = dockButton(page, words.players);
  await dock.focus();
  await page.keyboard.press('Enter');
  const sheet = players(page);
  await expect(sheet).toBeFocused();
  const character = sheet.getByLabel(words.character, { exact: true });
  await character.focus();
  await page.keyboard.press('Tab');
  await expect(sheet.getByLabel('The link expires after', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(sheet.getByRole('button', { name: words.create })).toBeFocused();
  await page.keyboard.press('Enter');
  const field = sheet.getByLabel(words.link, { exact: true });
  await expect(field).toBeVisible();
  // The link's field holds no draft: Escape there closes the sheet, which keeps the link.
  await field.focus();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(dock).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(field).toBeVisible();

  // A player joins. Revoking asks first: the question takes focus, Cancel gives it back.
  const player = await browser.newPage();
  await openInvitation(player, await field.inputValue());
  await expect(player.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible();
  const revoke = sheet.getByRole('button', { name: words.revoke(ELOWEN) });
  await revoke.focus();
  await page.keyboard.press('Enter');
  await expect(sheet.getByText(`Revoke the access of the player of ${ELOWEN}?`)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(sheet.getByRole('button', { name: words.revokeYes })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(sheet.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(revoke).toBeFocused();
  await expect(revoke).toHaveAttribute('aria-expanded', 'false');
  await expect(player.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible();

  // Signing out: the question opens on staying; the final choice takes a deliberate step.
  await page.getByRole('button', { name: words.signOut, exact: true }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: words.signOutQuestion });
  await expect(dialog.getByRole('button', { name: words.stay })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: words.signOut, exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: words.signedOut })).toBeFocused();
});
