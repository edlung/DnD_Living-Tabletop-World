import { expect, test, type Page } from '@playwright/test';

import { SIGN_IN_ORIGIN, signInSeed } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import {
  workshopInvitationToken,
  WORKSHOP_CAMPAIGN,
  type WorkshopFixture,
} from '../../apps/server/src/testing/ui-workshop-links.ts';
import { dmToken } from './support/sign-in.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });
const link = (name: WorkshopFixture) =>
  `/workshop/join#${workshopInvitationToken(signInSeed(), name)}`;
async function enter(page: Page, name: WorkshopFixture) {
  await page.goto(link(name));
  await page.getByRole('button', { name: 'Enter the workshop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your drafts', exact: true })).toBeVisible();
}
async function draft(page: Page, title: string) {
  await page.getByLabel('Campaign title', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}

test('an invitation waits for a deliberate entry; a private draft survives reload and sign-out asks first', async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url());
  });
  await page.goto(link('journey'));
  await expect(page.getByRole('heading', { name: 'You are invited to a workshop' })).toBeVisible();
  expect(requests).toEqual([]);
  expect(new URL(page.url()).hash).toBe('');
  await page.getByRole('button', { name: 'Enter the workshop', exact: true }).click();
  await draft(page, 'The bell beneath the ice');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'The bell beneath the ice', exact: true }),
  ).toBeVisible();
  const cookies = await context.cookies(`${SIGN_IN_ORIGIN}/api/workshop/drafts`);
  expect(cookies.find((cookie) => cookie.name === 'ltw_workshop')).toMatchObject({
    httpOnly: true,
    sameSite: 'Strict',
    path: '/api/workshop',
  });
  await page.getByRole('button', { name: 'Sign out of workshop', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Sign out of workshop?' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay signed in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your drafts', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out of workshop', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sign out of workshop', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Open your workshop with an invitation' }),
  ).toBeVisible();
  await expect(page.getByText('The bell beneath the ice')).toHaveCount(0);
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).toEqual({ local: 0, session: 0 });
});

test('two owners see only their own drafts and cannot fetch one another’s container', async ({
  browser,
}) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const first = await a.newPage();
  const second = await b.newPage();
  try {
    await enter(first, 'private-a');
    await draft(first, 'The private northern island');
    const own = await first.request.get(`${SIGN_IN_ORIGIN}/api/workshop/drafts`);
    const body = (await own.json()) as { drafts: { draftId: string }[] };
    await enter(second, 'private-b');
    await expect(second.getByText('The private northern island')).toHaveCount(0);
    const forbidden = await second.request.get(
      `${SIGN_IN_ORIGIN}/api/workshop/drafts/${body.drafts[0]?.draftId}`,
    );
    expect(forbidden.status()).toBe(404);
  } finally {
    await a.close();
    await b.close();
  }
});

test('replacing workshop access asks first and clears the old owner content', async ({ page }) => {
  await enter(page, 'replace-a');
  await draft(page, 'Old private world');
  await page.goto(link('replace-b'));
  await page.getByRole('button', { name: 'Enter the workshop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Replace your workshop sign-in?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep my workshop' })).toBeFocused();
  const replace = page.getByRole('button', { name: 'Open the invited workshop' });
  await replace.hover();
  await expect(replace).toHaveAttribute('aria-disabled', 'false');
  await replace.click();
  await expect(page.getByRole('heading', { name: 'Your drafts', exact: true })).toBeVisible();
  await expect(page.getByText('Old private world')).toHaveCount(0);
});

test('keeping the workshop leaves the other invitation usable in another browser', async ({
  page,
  browser,
}) => {
  await enter(page, 'keep-a');
  await draft(page, 'Kept world');
  await page.goto(link('keep-b'));
  await page.getByRole('button', { name: 'Enter the workshop', exact: true }).click();
  await page.getByRole('button', { name: 'Keep my workshop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kept world', exact: true })).toBeVisible();
  const other = await browser.newContext();
  try {
    await enter(await other.newPage(), 'keep-b');
  } finally {
    await other.close();
  }
});

test('a workshop and a game sign-in coexist and signing out of the workshop preserves the game', async ({
  page,
}) => {
  await page.goto(`/join#${dmToken(WORKSHOP_CAMPAIGN)}`);
  await page.getByRole('button', { name: 'Take your seat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await enter(page, 'coexist');
  await page.getByRole('button', { name: 'Sign out of workshop', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Sign out of workshop', exact: true })
    .click();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
});

test('more drafts keeps every private container reachable after the first page', async ({
  page,
}) => {
  await enter(page, 'unused');
  for (let index = 0; index < 51; index += 1) {
    const response = await page.request.post(`${SIGN_IN_ORIGIN}/api/workshop/drafts`, {
      headers: { Origin: SIGN_IN_ORIGIN },
      data: { requestId: crypto.randomUUID(), title: `Saved world ${index + 1}`, language: 'en' },
    });
    expect(response.ok()).toBe(true);
  }
  await page.getByRole('button', { name: 'Refresh drafts', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(50);
  await page.getByRole('button', { name: 'More drafts', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(51);
  await expect(page.getByRole('button', { name: 'More drafts', exact: true })).toHaveCount(0);
});

test('operator revocation removes private content when the page checks its sign-in again', async ({
  page,
}) => {
  await enter(page, 'revoked');
  await draft(page, 'World from lost device');
  const revoked = await page.request.post(`${SIGN_IN_ORIGIN}/api/testing/workshop-revoke/revoked`, {
    headers: { Origin: SIGN_IN_ORIGIN },
  });
  expect(revoked.ok()).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(
    page.getByRole('heading', { name: 'Open your workshop with an invitation' }),
  ).toBeVisible();
  await expect(page.getByText('World from lost device')).toHaveCount(0);
});

test('a lost draft response retries the same request and creates one container', async ({
  page,
}) => {
  await enter(page, 'retry');
  let first = true;
  await page.route('**/api/workshop/drafts', async (route) => {
    if (route.request().method() === 'POST' && first) {
      first = false;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.getByLabel('Campaign title', { exact: true }).fill('One saved world');
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  await page.getByRole('button', { name: 'Retry saving draft', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'One saved world', exact: true })).toHaveCount(1);
  const response = await page.request.get(`${SIGN_IN_ORIGIN}/api/workshop/drafts`);
  expect(((await response.json()) as { drafts: unknown[] }).drafts).toHaveLength(1);
});

test('page-history restoration clears private content and reads the workshop identity again', async ({
  page,
}) => {
  await enter(page, 'keyboard');
  await draft(page, 'A fresh identity after returning');
  const immediatelyHidden = await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    return document.body.innerText;
  });
  expect(immediatelyHidden).not.toContain('A fresh identity after returning');
  expect(immediatelyHidden).not.toContain('Your drafts');
  await expect(page.getByText('A fresh identity after returning')).toHaveCount(0);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(
    page.getByRole('heading', { name: 'A fresh identity after returning', exact: true }),
  ).toBeVisible();
});

test('a stale tab cannot create its previous owner’s draft under a replaced cookie', async ({
  page,
  context,
}) => {
  await enter(page, 'stale-a');
  await page
    .getByLabel('Campaign title', { exact: true })
    .fill('Private unsent draft from the old owner');
  await page.route('**/api/workshop/auth/session', (route) => route.abort());
  const other = await context.newPage();
  await other.goto(link('stale-b'));
  await other.getByRole('button', { name: 'Enter the workshop', exact: true }).click();
  const replace = other.getByRole('button', { name: 'Open the invited workshop' });
  await replace.hover();
  await expect(replace).toHaveAttribute('aria-disabled', 'false');
  await replace.click();
  await expect(other.getByRole('heading', { name: 'Your drafts', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Open your workshop with an invitation' }),
  ).toBeVisible();
  await expect(page.getByLabel('Campaign title', { exact: true })).toHaveCount(0);
  await other.getByRole('button', { name: 'Refresh drafts', exact: true }).click();
  await expect(other.getByText('Private unsent draft from the old owner')).toHaveCount(0);
  await expect(other.getByRole('heading', { name: 'Your drafts', exact: true })).toBeVisible();
});

test('workshop access and creating a draft work in Russian on a phone', async ({ browser }) => {
  const context = await browser.newContext({
    locale: 'ru-RU',
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto(`${SIGN_IN_ORIGIN}${link('russian')}`);
    await page.getByRole('button', { name: 'Войти в мастерскую', exact: true }).click();
    await page.getByLabel('Название кампании', { exact: true }).fill('Колокол подо льдом');
    await page.getByRole('button', { name: 'Создать черновик', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Колокол подо льдом', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Мастерская кампаний', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  } finally {
    await context.close();
  }
});
