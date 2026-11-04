import { readFileSync } from 'node:fs';

import { expect, test, type Browser, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { dockButton } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
  accessState,
  dmToken,
  invite,
} from './support/sign-in.ts';

/**
 * A person's data in the browser (docs/adr/0062-account-privacy.md, Stage 699a): the privacy notice
 * from the sign-in screen, in both languages; a player's copy of their data saved from the account's
 * page; the player deleting the account — a wrong password refused, then done, every device signed
 * out and the login opening nothing; the DM's account left to the operator.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const words = WORDS.en;
const PASSWORD = 'a lantern in the rain';
const ELOWEN = 'Elowen Starwhisper';
const LIVE = { timeout: 15_000 };

const hub = (page: Page) => page.getByRole('region', { name: 'Your campaigns', exact: true });
const data = (page: Page) => page.getByRole('region', { name: 'Your data', exact: true });

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

async function takeSeatWithNewLogin(page: Page, name: string, login: string): Promise<void> {
  const invited = accessState(page, words.invited);
  await invited.getByLabel('Your name at the table', { exact: true }).fill(name);
  await invited.getByLabel('Login', { exact: true }).fill(login);
  await invited.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await invited.getByRole('button', { name: words.takeSeat, exact: true }).click();
}

test('the privacy notice reads before signing in, in both languages', async ({ page }) => {
  await page.goto('/');
  await expect(accessState(page, words.none)).toBeVisible();
  await page.getByRole('link', { name: 'Privacy notice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Privacy notice', level: 1 })).toBeVisible();
  await expect(page.getByText('No e-mail, no phone number.', { exact: false })).toBeVisible();
  await expectAccessible(page, 'the privacy notice');
  await page.getByRole('button', { name: 'Русский', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Конфиденциальность', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Вернуться к игре', exact: true }).click();
  await expect(accessState(page, words.none)).toBeVisible();
});

test('a player saves a copy of their data and deletes the account; a DM cannot', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const dm = await freshPage(browser);
  await dm.goto(`/join#${dmToken(SIGN_IN_CAMPAIGNS.privacy)}`);
  await takeSeatWithNewLogin(dm, 'Ada', 'ada-privacy');
  await expect(dockButton(dm, words.players)).toBeVisible(LIVE);
  const link = await invite(dm, ELOWEN);

  const phone = await freshPage(browser);
  await phone.goto(link);
  await takeSeatWithNewLogin(phone, 'Lena', 'lena-privacy');
  await expect(phone.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible(LIVE);
  await phone.getByRole('button', { name: 'My campaigns', exact: true }).click();
  await expect(hub(phone)).toContainText(`You play ${ELOWEN}`);

  // The copy: one JSON file with the account and its campaign, nothing secret in it.
  const [download] = await Promise.all([
    phone.waitForEvent('download'),
    data(phone).getByRole('link', { name: 'Download my data', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^ltw-lena-privacy-\d{4}-\d{2}-\d{2}\.json$/);
  const copy = readFileSync(await download.path(), 'utf8');
  expect(JSON.parse(copy)).toMatchObject({
    account: { login: 'lena-privacy', displayName: 'Lena' },
    campaigns: [{ role: 'player', characters: [{ name: ELOWEN }] }],
  });
  expect(copy).not.toMatch(/scrypt|token/i);

  // Deleting asks for the login and the password; a wrong one is refused, nothing changes.
  await data(phone).getByRole('button', { name: 'Delete my account', exact: true }).click();
  const dialog = phone.getByRole('dialog', { name: 'Delete your account?' });
  await expect(dialog.getByRole('button', { name: 'Keep my account', exact: true })).toBeFocused();
  await expectAccessible(phone, 'deleting the account');
  await dialog.getByLabel('Your login', { exact: true }).fill('lena-privacy');
  await dialog.getByLabel('Your password', { exact: true }).fill('not the password at all');
  await dialog.getByRole('button', { name: 'Delete my account', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('The login or the password is not right.');
  await dialog.getByLabel('Your password', { exact: true }).fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Delete my account', exact: true }).click();
  const done = phone.getByRole('dialog', { name: 'Your account is deleted' });
  await expect(done).toBeVisible();
  await done.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(accessState(phone, words.signedOut)).toBeVisible(LIVE);

  // The login opens nothing now.
  await phone.getByLabel('Login', { exact: true }).fill('lena-privacy');
  await phone.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await phone.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(phone.getByRole('alert')).toHaveText('That login and password do not match.');

  // A DM's account stays: the operator deletes it.
  await dm.getByRole('button', { name: 'My campaigns', exact: true }).click();
  await data(dm).getByRole('button', { name: 'Delete my account', exact: true }).click();
  const asked = dm.getByRole('dialog', { name: 'Delete your account?' });
  await asked.getByLabel('Your login', { exact: true }).fill('ada-privacy');
  await asked.getByLabel('Your password', { exact: true }).fill(PASSWORD);
  await asked.getByRole('button', { name: 'Delete my account', exact: true }).click();
  await expect(asked.getByRole('alert')).toHaveText(
    'You are the DM of a campaign: the server’s operator deletes a DM’s account.',
  );
});
