import { expect, test, type Browser, type Page } from '@playwright/test';

import { openSheet } from './support/shell.ts';
import { SIGN_IN_CAMPAIGNS, SIGN_IN_ORIGIN, START, WORDS, joinAsDm } from './support/sign-in.ts';

/**
 * The page's side of the native apps (docs/adr/0070-native-apps.md §2, §4–§7) with a stand-in for
 * the shell, installed before the page's scripts as the apps' shim is: it records what the page
 * posts, and the journey speaks for the shell with `ltw-native` events. In a browser nothing
 * changes; in the apps the sign-in page offers the scanner and the server, Android's Back closes
 * the topmost sheet first, and LTW DM's TV reports its code so that one press pairs it.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const words = WORDS.en;
const LIVE = { timeout: 15_000 };
const CODE = /^[A-HJKMNP-Z2-9]{8}$/;

type Posted = { readonly type: string; readonly [field: string]: unknown };

/** A fresh browser whose pages carry a stand-in shell (or none). */
async function withShell(
  browser: Browser,
  shell: { readonly app: 'player' | 'dm' | 'tv'; readonly features: readonly string[] } | null,
): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  if (shell !== null) {
    await page.addInitScript((config) => {
      const posted: unknown[] = [];
      Object.defineProperty(window, '__posted', { value: posted });
      Object.defineProperty(window, 'ltwNative', {
        value: Object.freeze({
          version: 1,
          platform: 'ios',
          app: config.app,
          features: config.features,
          post: (message: unknown) => posted.push(message),
        }),
      });
    }, shell);
  }
  return page;
}

const posted = (page: Page): Promise<Posted[]> =>
  page.evaluate(() => (window as unknown as { __posted: Posted[] }).__posted.slice());

/** The shell speaks: a message as the shim hands it to the page. */
const tell = (page: Page, message: Posted): Promise<boolean> =>
  page.evaluate(
    (detail) => window.dispatchEvent(new CustomEvent('ltw-native', { detail })),
    message,
  );

test('the sign-in page offers the scanner and the server in the apps only', async ({ browser }) => {
  const plain = await withShell(browser, null);
  await plain.goto(START);
  await expect(plain.getByRole('heading', { name: words.none })).toBeVisible(LIVE);
  await expect(plain.getByRole('button', { name: 'Scan the table’s code' })).toHaveCount(0);

  const app = await withShell(browser, { app: 'player', features: ['scan', 'server', 'back'] });
  await app.goto(START);
  await expect(app.getByRole('heading', { name: words.none })).toBeVisible(LIVE);
  await app.getByRole('button', { name: 'Scan the table’s code' }).click();
  await app.getByRole('button', { name: 'Server: 127.0.0.1:4312' }).click();
  // The page said it was ready once, before anything was asked.
  expect(await posted(app)).toEqual([{ type: 'ready' }, { type: 'scan' }, { type: 'server' }]);
});

test("Android's Back closes the topmost sheet, then lets the app go", async ({ browser }) => {
  const dm = await withShell(browser, { app: 'dm', features: ['back'] });
  await joinAsDm(dm, SIGN_IN_CAMPAIGNS.native, 0);
  await openSheet(dm, words.players);
  await expect(dm.locator('#sheet-players')).toBeVisible();

  await tell(dm, { type: 'back', id: 1 });
  await expect(dm.locator('#sheet-players')).toBeHidden();
  await tell(dm, { type: 'back', id: 2 });
  await expect
    .poll(async () => (await posted(dm)).filter((message) => message.type === 'back-result'))
    .toEqual([
      { type: 'back-result', handled: true, id: 1 },
      { type: 'back-result', handled: false, id: 2 },
    ]);
});

test("LTW DM's TV reports its code, and one press pairs it", async ({ browser }) => {
  const dm = await withShell(browser, { app: 'dm', features: ['tv', 'scan', 'server'] });
  await joinAsDm(dm, SIGN_IN_CAMPAIGNS.native, 1);
  await openSheet(dm, 'Table screen');
  const sheet = dm.locator('#sheet-screen');
  const panel = sheet.getByRole('region', { name: 'The TV of this device' });
  // The page's first word: no TV yet; mirroring is not the danger here that it is in a browser.
  await tell(dm, { type: 'tv', state: 'absent' });
  await expect(panel).toContainText('Connect a TV by AirPlay');
  await expect(sheet).not.toContainText('Mirroring this iPad or laptop');

  // The TV's own window: the table display, which tells the app the code it shows.
  const tv = await withShell(browser, { app: 'tv', features: ['awake'] });
  await tv.goto('/display');
  await expect
    .poll(async () => (await posted(tv)).find((message) => message.type === 'tv-code'), LIVE)
    .toBeTruthy();
  const reported = (await posted(tv)).find((message) => message.type === 'tv-code');
  const code = String(reported?.['code']);
  expect(code).toMatch(CODE);

  // The app passes it on; the DM pairs with one press, and the TV follows the DM's cast.
  await tell(dm, { type: 'tv', state: 'pairing', code });
  await expect(panel.getByLabel(`Pairing code ${code}`)).toHaveText(
    `${code.slice(0, 4)} ${code.slice(4)}`,
  );
  await panel.getByRole('button', { name: 'Pair this TV' }).click();
  await expect(sheet).toContainText('Paired screens: 1 of 4', LIVE);
  await expect(tv.locator('.display-code')).toHaveCount(0, LIVE);
  await expect
    .poll(async () => (await posted(tv)).some((message) => message.type === 'tv-paired'), LIVE)
    .toBe(true);
  const paired = (await posted(tv)).find((message) => message.type === 'tv-paired');
  expect(paired?.['campaign']).toBe(SIGN_IN_CAMPAIGNS.native);
  await tell(dm, { type: 'tv', state: 'paired', campaign: SIGN_IN_CAMPAIGNS.native });
  await expect(panel).toContainText('is paired');

  // The same TV, still paired with another campaign: the DM asks it to show this one, and the
  // TV forgets its pairing and shows a new code.
  await tell(dm, { type: 'tv', state: 'paired', campaign: 'ui-another-campaign' });
  await expect(panel).toContainText('still shows another campaign');
  await panel.getByRole('button', { name: 'Show this campaign on the TV' }).click();
  expect(await posted(dm)).toContainEqual({ type: 'tv-forget' });
  await tell(tv, { type: 'forget' });
  await expect(tv.locator('.display-code')).toHaveText(
    /^[A-HJKMNP-Z2-9]{4} [A-HJKMNP-Z2-9]{4}$/,
    LIVE,
  );
  await expect
    .poll(
      async () => (await posted(tv)).filter((message) => message.type === 'tv-code').length,
      LIVE,
    )
    .toBeGreaterThan(1);
});
