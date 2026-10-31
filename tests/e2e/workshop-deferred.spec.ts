import { expect, test, type Page } from '@playwright/test';

import { SIGN_IN_ORIGIN, signInSeed } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import {
  workshopInvitationToken,
  type WorkshopFixture,
} from '../../apps/server/src/testing/ui-workshop-links.ts';
import { TOKENS } from './support/session.ts';
import { chooseLocation } from './support/shell.ts';
import { expectUnreachable, holdsAny } from './support/sign-in.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });
test.setTimeout(60000);

const PRIVATE_ENTRY = /\/src\/workshop\/private\.tsx(?:\?|$)/;
const privateGraph = (url: string) => {
  const path = new URL(url).pathname;
  return (
    /^\/src\/workshop\/(?:private|editor|scenario-tab)\.tsx$/.test(path) ||
    /^\/src\/(?:styles\/workshop-|i18n\/ru-workshop-)(?:editor|generation|scenario|preview|pictures|editing|activation)\.(?:css|ts)$/.test(
      path,
    )
  );
};
function traffic(page: Page) {
  const paths: string[] = [],
    methods: { method: string; path: string }[] = [];
  page.on('request', (request) => {
    if (privateGraph(request.url())) paths.push(new URL(request.url()).pathname);
    methods.push({ method: request.method(), path: new URL(request.url()).pathname });
  });
  return {
    paths,
    count: (method: string, path: string) =>
      methods.filter((entry) => entry.method === method && entry.path === path).length,
  };
}
async function invitation(page: Page, name: WorkshopFixture) {
  const token = workshopInvitationToken(signInSeed(), name);
  await page.goto(`/workshop/join#${token}`);
  await expect(
    page.getByRole('heading', { name: 'You are invited to a workshop', exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  return token;
}
async function noCredentialKept(page: Page, token: string) {
  // Never send the token into evaluate: compare the returned data only in the test process.
  const visible = await page.evaluate(() => ({
    href: location.href,
    state: JSON.stringify(history.state),
    dom: document.documentElement.outerHTML,
    local: JSON.stringify(
      Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
    ),
    session: JSON.stringify(
      Object.fromEntries(
        Object.keys(sessionStorage).map((key) => [key, sessionStorage.getItem(key)]),
      ),
    ),
    timing: performance
      .getEntries()
      .map((entry) => entry.name)
      .join('\n'),
  }));
  expect(
    holdsAny(JSON.stringify(visible), [token]),
    'no credential in the page, URL, timing or browser storage',
  ).toBe(false);
  await expectUnreachable(page, [token]);
}

test('normal play and an unsigned workshop do not request the authenticated editor graph', async ({
  page,
}) => {
  const requests = traffic(page);
  await page.goto('http://127.0.0.1:4310/');
  await page.getByLabel('Access token', { exact: true }).fill(TOKENS.player);
  await page.getByLabel('Campaign', { exact: true }).fill('ravenford');
  await page.getByRole('button', { name: 'Enter world', exact: true }).click();
  await chooseLocation(page, 'market-square');
  await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible();
  expect(requests.paths).toEqual([]);
  await page.goto(`${SIGN_IN_ORIGIN}/workshop`);
  await expect(
    page.getByRole('heading', { name: 'Open your workshop with an invitation', exact: true }),
  ).toBeVisible();
  expect(requests.paths).toEqual([]);
  expect(requests.count('GET', '/api/workshop/auth/session')).toBe(1);
});

test('only deliberate authenticated entry loads private tools, with one first probe and no credential retained', async ({
  page,
}) => {
  const requests = traffic(page),
    token = await invitation(page, 'lazy-entry');
  expect(requests.paths).toEqual([]);
  expect(requests.count('POST', '/api/workshop/auth/redeem')).toBe(0);
  expect(requests.count('GET', '/api/workshop/auth/session')).toBe(0);
  await page.getByRole('button', { name: 'Enter the workshop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your drafts', exact: true })).toBeVisible();
  expect(requests.paths.some((path) => path.endsWith('/private.tsx'))).toBe(true);
  expect(requests.paths.some((path) => path.endsWith('/workshop-editor.css'))).toBe(true);
  expect(requests.count('POST', '/api/workshop/auth/redeem')).toBe(1);
  expect(requests.count('GET', '/api/workshop/auth/session')).toBe(1);
  await noCredentialKept(page, token);
});

test('a refused private chunk shows a focused plain failure and reload recovers the same workshop', async ({
  page,
}) => {
  const requests = traffic(page),
    token = await invitation(page, 'lazy-failure');
  await page.route(PRIVATE_ENTRY, (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Enter the workshop', exact: true }).click();
  const heading = page.getByRole('heading', {
    name: 'Workshop tools could not be loaded',
    exact: true,
  });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Your drafts', exact: true })).toHaveCount(0);
  expect(requests.count('GET', '/api/workshop/drafts')).toBe(0);
  await noCredentialKept(page, token);
  await page.unroute(PRIVATE_ENTRY);
  await page.getByRole('button', { name: 'Reload workshop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your drafts', exact: true })).toBeVisible();
  expect(requests.count('POST', '/api/workshop/auth/redeem')).toBe(1);
  expect(requests.count('GET', '/api/workshop/auth/session')).toBe(2);
});

test('pagehide clears a held lazy branch immediately and its late chunk cannot mount private content', async ({
  page,
}) => {
  const requests = traffic(page),
    token = await invitation(page, 'lazy-held');
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached = () => {};
  const requested = new Promise<void>((resolve) => {
    reached = resolve;
  });
  await page.route(PRIVATE_ENTRY, async (route) => {
    reached();
    await held;
    await route.continue().catch(() => {});
  });
  try {
    await page.getByRole('button', { name: 'Enter the workshop', exact: true }).click();
    await requested;
    await expect(page.getByText('Loading workshop tools…', { exact: true })).toBeVisible();
    const retained = await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      const text = document.body.innerText;
      return {
        loading: text.includes('Loading workshop tools…'),
        signOut: text.includes('Sign out of workshop'),
        drafts: text.includes('Your drafts'),
      };
    });
    expect(retained).toEqual({ loading: false, signOut: false, drafts: false });
    release();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Your drafts', exact: true })).toHaveCount(0);
    expect(requests.count('GET', '/api/workshop/drafts')).toBe(0);
    await noCredentialKept(page, token);
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await expect(page.getByRole('heading', { name: 'Your drafts', exact: true })).toBeVisible();
    expect(requests.count('POST', '/api/workshop/auth/redeem')).toBe(1);
    expect(requests.count('GET', '/api/workshop/auth/session')).toBe(2);
  } finally {
    release();
  }
});
