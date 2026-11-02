import { expect, test, type Browser, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { dockButton, openSheet } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
  accessState,
  dmToken,
  invite,
  joinAsDm,
  joinPath,
} from './support/sign-in.ts';

/**
 * Accounts in the browser (docs/adr/0041-accounts.md, Stage 600), on the invitation-mode servers:
 * the DM and a player join with new logins; the player signs out, signs in on another device and
 * opens the campaign from the hub; a campaign from a ready adventure has the account as its DM; the
 * DM's invitation shows as a QR code; the DM hands over a reset link that sets a new password and
 * signs the login out everywhere. A seat taken without a login is saved to one later; a taken
 * login is refused with the invitation unspent; "I have a login" adds a seat to an account. No
 * trace or screenshot is kept: the Players sheet shows links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const ELOWEN = 'Elowen Starwhisper';
const words = WORDS.en;
const PASSWORD = 'a lantern in the rain';
/** Live and multi-browser steps get the time a hosted runner needs (tests/e2e/AGENTS.md). */
const LIVE = { timeout: 15_000 };

const players = (page: Page) => page.locator('#sheet-players');
const hub = (page: Page) => page.getByRole('region', { name: 'Your campaigns', exact: true });
const inWorld = (page: Page) => page.getByRole('button', { name: 'Mira Vale', exact: true });

interface NewLogin {
  readonly name: string;
  readonly login: string;
  readonly password: string;
}

/** On a join page: a new login's three fields, then "Take your seat". */
async function takeSeatWithNewLogin(page: Page, account: NewLogin): Promise<void> {
  const invited = accessState(page, words.invited);
  await expect(invited.getByRole('radio', { name: 'Create a login', exact: true })).toBeChecked();
  await invited.getByLabel('Your name at the table', { exact: true }).fill(account.name);
  await invited.getByLabel('Login', { exact: true }).fill(account.login);
  await invited.getByLabel('Password', { exact: true }).fill(account.password);
  await invited.getByRole('button', { name: words.takeSeat, exact: true }).click();
}

/** The signed-out screen's form: a login and its password. */
async function signIn(page: Page, login: string, password: string): Promise<void> {
  await page.getByLabel('Login', { exact: true }).fill(login);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** The top bar's "Sign out", confirmed. */
async function signOut(page: Page, says: string): Promise<void> {
  await page.getByRole('button', { name: words.signOut, exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: words.signOutQuestion });
  await expect(dialog).toContainText(says);
  await dialog.getByRole('button', { name: words.signOut, exact: true }).click();
  await expect(accessState(page, words.signedOut)).toBeVisible();
}

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

test('logins hold seats: join, sign out and in elsewhere, the hub, a new campaign, a reset', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const campaign = SIGN_IN_CAMPAIGNS.accounts;

  // The DM joins with a new login: the world opens, its top bar offers "My campaigns".
  const dm = await freshPage(browser);
  await dm.goto(joinPath(dmToken(campaign)));
  await takeSeatWithNewLogin(dm, { name: 'Ada', login: 'ada-dm', password: PASSWORD });
  await expect(dockButton(dm, words.players)).toBeVisible(LIVE);
  await expect(dm.getByRole('button', { name: 'My campaigns', exact: true })).toBeVisible();

  // The invitation is shown once, with its QR code for a phone at the table.
  const link = await invite(dm, ELOWEN);
  await expect(
    players(dm).getByRole('img', { name: `QR code of the invitation link for ${ELOWEN}` }),
  ).toBeVisible();

  // The player joins with a new login; the DM's sheet shows the seat's login.
  const phone = await freshPage(browser);
  await phone.goto(link);
  await takeSeatWithNewLogin(phone, { name: 'Lena', login: 'Lena.Plays', password: PASSWORD });
  await expect(inWorld(phone)).toBeVisible(LIVE);
  const seat = players(dm)
    .getByRole('region', { name: words.members })
    .getByRole('listitem')
    .filter({ hasText: ELOWEN });
  await expect(seat).toContainText('Login: lena.plays', LIVE);

  // Signing out signs the login out too; the screen offers signing in again.
  await signOut(phone, 'Your login signs out of this browser too.');
  await signIn(phone, 'lena.plays', 'not the password at all');
  await expect(phone.getByRole('alert')).toHaveText('That login and password do not match.');

  // Another device: the hub lists the campaign, and opens it.
  const laptop = await freshPage(browser);
  await laptop.goto('/');
  await expect(accessState(laptop, words.none)).toBeVisible();
  await signIn(laptop, 'LENA.PLAYS', PASSWORD);
  await expect(hub(laptop)).toContainText(`You play ${ELOWEN}`);
  await expectAccessible(laptop, 'the hub');
  await hub(laptop)
    .getByRole('button', { name: `Open The Missing Caravan: You play ${ELOWEN}`, exact: true })
    .click();
  await expect(inWorld(laptop)).toBeVisible(LIVE);

  // A campaign from a ready adventure: the login is its DM; the hub then lists both.
  await laptop.getByRole('button', { name: 'My campaigns', exact: true }).click();
  await hub(laptop)
    .getByRole('button', { name: 'The Missing Caravan, in English', exact: true })
    .click();
  await expect(dockButton(laptop, words.players)).toBeVisible(LIVE);
  await laptop.getByRole('button', { name: 'My campaigns', exact: true }).click();
  await expect(hub(laptop).getByRole('listitem')).toHaveCount(2);
  await expect(hub(laptop)).toContainText('You are the DM');
  await hub(laptop)
    .getByRole('button', { name: `Open The Missing Caravan: You play ${ELOWEN}`, exact: true })
    .click();
  await expect(inWorld(laptop)).toBeVisible(LIVE);

  // The DM hands over a reset link (shown once, with its QR code).
  await seat.getByRole('button', { name: `Password reset link: ${ELOWEN}`, exact: true }).click();
  const field = players(dm).getByLabel('Password reset link', { exact: true });
  await expect(field).toHaveValue(/^http:\/\/127\.0\.0\.1:4312\/reset#[A-Za-z0-9_-]{43}$/);
  await expect(
    players(dm).getByRole('img', { name: `QR code of the password reset link for ${ELOWEN}` }),
  ).toBeVisible();
  const reset = await field.inputValue();

  // The reset sets a new password; the laptop's world signs out with the old one.
  const tablet = await freshPage(browser);
  await tablet.goto(reset);
  expect(tablet.url()).toBe(`${SIGN_IN_ORIGIN}/`);
  await expect(accessState(tablet, 'Set a new password')).toBeVisible();
  await expectAccessible(tablet, 'a reset link');
  await tablet.getByLabel('New password', { exact: true }).fill('short');
  await tablet.getByRole('button', { name: 'Set the new password', exact: true }).click();
  await expect(tablet.getByLabel('New password', { exact: true })).toBeFocused();
  await expect(tablet.getByText('Use at least 10 characters.', { exact: true })).toBeVisible();
  await tablet.getByLabel('New password', { exact: true }).fill('a brand new phrase');
  await tablet.getByRole('button', { name: 'Set the new password', exact: true }).click();
  await expect(tablet.getByRole('status')).toHaveText('Your new password is set. Sign in with it.');
  await expect(accessState(laptop, words.signedOut)).toBeVisible(LIVE);
  await signIn(tablet, 'lena.plays', 'a brand new phrase');
  await expect(hub(tablet)).toContainText(`You play ${ELOWEN}`);
});

test('a seat is saved to a login later, a taken login waits, and "I have a login" adds a seat', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const campaign = SIGN_IN_CAMPAIGNS.accountsClaim;

  // The DM joined in this browser only, then saves the seat to a new login.
  const dm = await freshPage(browser);
  await joinAsDm(dm, campaign);
  await dm.getByRole('button', { name: 'Save my seat', exact: true }).click();
  const dialog = dm.getByRole('dialog', { name: 'Save your seat to a login' });
  await dialog.getByRole('button', { name: 'Save my seat', exact: true }).click();
  await expect(dialog.getByLabel('Your name at the table', { exact: true })).toBeFocused();
  await expectAccessible(dm, 'saving a seat, its fields pointed out');
  await dialog.getByLabel('Your name at the table', { exact: true }).fill('Brann');
  await dialog.getByLabel('Login', { exact: true }).fill('brann');
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Save my seat', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(dm.getByRole('button', { name: 'My campaigns', exact: true })).toBeVisible();

  // The player's login is taken: the same invitation still seats them with another one.
  const link = await invite(dm, ELOWEN);
  const player = await freshPage(browser);
  await player.goto(link);
  await takeSeatWithNewLogin(player, { name: 'Tam', login: 'brann', password: PASSWORD });
  const invited = accessState(player, words.invited);
  await expect(invited.getByLabel('Login', { exact: true })).toBeFocused(LIVE);
  await expect(invited).toContainText('That login is taken. Choose another one.');
  await invited.getByLabel('Login', { exact: true }).fill('tam');
  await invited.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await invited.getByRole('button', { name: words.takeSeat, exact: true }).click();
  await expect(inWorld(player)).toBeVisible(LIVE);
  await signOut(player, 'Your login signs out of this browser too.');

  // The DM frees the seat and invites again; "I have a login" seats the same account.
  await openSheet(dm, words.players);
  const seat = players(dm)
    .getByRole('region', { name: words.members })
    .getByRole('listitem')
    .filter({ hasText: ELOWEN });
  await seat.getByRole('button', { name: words.revoke(ELOWEN) }).click();
  await seat.getByRole('button', { name: words.revokeYes }).click();
  await expect(players(dm)).toContainText('can be invited again', LIVE);
  const again = await invite(dm, ELOWEN);
  await player.goto(again);
  const second = accessState(player, words.invited);
  await second.getByRole('radio', { name: 'I have a login', exact: true }).check();
  await second.getByLabel('Login', { exact: true }).fill('tam');
  await second.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await second.getByRole('button', { name: words.takeSeat, exact: true }).click();
  await expect(inWorld(player)).toBeVisible(LIVE);
  await player.getByRole('button', { name: 'My campaigns', exact: true }).click();
  await expect(hub(player).getByRole('listitem')).toHaveCount(1);
  await expect(hub(player)).toContainText(`You play ${ELOWEN}`);
});
