import { expect, test, type Browser, type Page } from '@playwright/test';

import { openSheet } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  START,
  WORDS,
  dmToken,
  joinAsDm,
  joinPath,
} from './support/sign-in.ts';

/**
 * The apps after their polish (work-orders/NATIVE_TV_POLISH_2026-11-15.md §2), with the stand-in
 * shell of `native-shell.spec.ts`: LTW DM sets the sound of its TV, whose window plays without a
 * press and has no corner to press; LTW DM offers the campaign workshop and the workshop the way
 * back; the join page speaks of the app, not of a browser.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const words = WORDS.en;
const LIVE = { timeout: 15_000 };

type Posted = { readonly type: string; readonly [field: string]: unknown };
type Shell = { readonly app: 'player' | 'dm' | 'tv'; readonly features: readonly string[] };

async function withShell(browser: Browser, shell: Shell): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
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
  return page;
}

const posted = (page: Page): Promise<Posted[]> =>
  page.evaluate(() => (window as unknown as { __posted: Posted[] }).__posted.slice());

const tell = (page: Page, message: Posted): Promise<boolean> =>
  page.evaluate(
    (detail) => window.dispatchEvent(new CustomEvent('ltw-native', { detail })),
    message,
  );

const sounds = async (page: Page) =>
  (await posted(page)).filter((message) => message.type === 'tv-sound');

test("LTW DM sets its TV's sound; the TV's window plays without a press", async ({ browser }) => {
  test.setTimeout(90_000);
  const dm = await withShell(browser, { app: 'dm', features: ['tv', 'tv-sound'] });
  await joinAsDm(dm, SIGN_IN_CAMPAIGNS.native, 2);
  // A TV that comes hears the DM's choice at once: on, at the default volume.
  await tell(dm, { type: 'tv', state: 'connected' });
  await expect.poll(() => sounds(dm), LIVE).toEqual([{ type: 'tv-sound', on: true, volume: 70 }]);

  // The TV's own window: no corner to press, and the page says it is ready once its ear is up.
  const tv = await withShell(browser, { app: 'tv', features: ['awake', 'sound'] });
  await tv.goto('/display');
  await expect
    .poll(async () => (await posted(tv)).find((message) => message.type === 'tv-code'), LIVE)
    .toBeTruthy();
  const code = String((await posted(tv)).find((message) => message.type === 'tv-code')?.['code']);
  await tell(dm, { type: 'tv', state: 'pairing', code });
  await openSheet(dm, 'Table screen');
  const panel = dm.locator('#sheet-screen').getByRole('region', { name: 'The TV of this device' });
  await panel.getByRole('button', { name: 'Pair this TV' }).click();
  await expect(tv.locator('main.display')).toHaveAttribute('data-cast', 'scene', LIVE);
  await expect(tv.locator('.display-corner')).toHaveCount(0);
  await expect
    .poll(async () => (await posted(tv)).filter((message) => message.type === 'ready').length, LIVE)
    .toBeGreaterThan(1);

  // The DM turns it down and off; the app carries each word to the TV's page, which keeps it.
  const volume = panel.getByLabel('Volume on the TV', { exact: true });
  await volume.fill('30');
  await expect
    .poll(async () => (await sounds(dm)).at(-1), LIVE)
    .toEqual({
      type: 'tv-sound',
      on: true,
      volume: 30,
    });
  await panel.getByLabel('Sound on the TV: ambience, music and the dice').uncheck();
  await expect
    .poll(async () => (await sounds(dm)).at(-1), LIVE)
    .toEqual({
      type: 'tv-sound',
      on: false,
      volume: 30,
    });
  await expect(volume).toBeDisabled();
  await tell(tv, { type: 'sound', on: false, volume: 30 });
  const kept = () =>
    tv.evaluate(
      () =>
        JSON.parse(window.localStorage.getItem('ltw.dice-settings') ?? '{}') as Record<
          string,
          unknown
        >,
    );
  await expect.poll(kept, LIVE).toMatchObject({ sound: false, atmosphere: false, volume: 0.3 });
  // A word that is not the bridge's changes nothing.
  await tell(tv, { type: 'sound', on: true, volume: 250 });
  await tell(tv, { type: 'sound', on: 'yes', volume: 50 });
  expect(await kept()).toMatchObject({ sound: false, volume: 0.3 });
});

test('LTW DM offers the workshop and the workshop the way back; the join page speaks of the app', async ({
  browser,
}) => {
  // The players' app has no workshop door.
  const player = await withShell(browser, { app: 'player', features: ['scan', 'server'] });
  await player.goto(START);
  await expect(player.getByRole('heading', { name: words.none })).toBeVisible(LIVE);
  await expect(player.getByRole('link', { name: 'Campaign workshop' })).toHaveCount(0);
  // The signed-out page speaks of the app too, never of a browser.
  await expect(player.getByText('stays in this app on this device')).toBeVisible();
  await expect(player.getByText('browser')).toHaveCount(0);

  const dm = await withShell(browser, { app: 'dm', features: ['scan', 'server', 'tv'] });
  await dm.goto(START);
  await dm.getByRole('link', { name: 'Campaign workshop' }).click();
  await expect(dm).toHaveURL(/\/workshop$/);
  await expect(dm.getByRole('heading', { level: 1, name: 'Campaign workshop' })).toBeVisible(LIVE);
  await dm.getByRole('link', { name: 'To the game' }).click();
  await expect(dm.getByRole('heading', { name: words.none })).toBeVisible(LIVE);

  // An invitation opened in the app: the seat without a login is the app's, not a browser's.
  await dm.goto(joinPath(dmToken(SIGN_IN_CAMPAIGNS.room, 2)));
  await expect(dm.getByRole('radio', { name: 'Only this app', exact: true })).toBeVisible(LIVE);
  await expect(dm.getByRole('radio', { name: words.onlyBrowser, exact: true })).toHaveCount(0);

  // In a browser the workshop has no such link: its address bar is the way.
  const plain = await (await browser.newContext()).newPage();
  await plain.goto('/workshop');
  await expect(plain.getByRole('heading', { level: 1, name: 'Campaign workshop' })).toBeVisible(
    LIVE,
  );
  await expect(plain.getByRole('link', { name: 'To the game' })).toHaveCount(0);
  await plain.goto(START);
  await expect(plain.getByText('stays in that browser')).toBeVisible(LIVE);
});
