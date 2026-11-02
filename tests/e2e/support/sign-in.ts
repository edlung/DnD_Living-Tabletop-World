import { randomBytes } from 'node:crypto';

import { expect, type BrowserContext, type Page } from '@playwright/test';

import {
  SIGN_IN_ORIGIN,
  dmInvitationToken,
  signInSeed,
} from '../../../apps/server/src/testing/ui-sign-in-links.ts';
import campaigns from '../fixtures/sign-in-campaigns.json' with { type: 'json' };
import { dockButton, openSheet } from './shell.ts';

/**
 * Production sign-in in the browser (docs/adr/0036-production-sign-in.md §7; tests/e2e/AGENTS.md):
 * journeys against the invitation-mode servers (`ui-sign-in-server.ts` behind the second Vite
 * server, `SIGN_IN_ORIGIN`). Each journey owns a campaign of `sign-in-campaigns.json`. No token is
 * ever printed: assertions about tokens are yes/no, and the specs keep no trace or screenshot. An
 * invitation is sent only when the person takes their seat (docs/STAGE_340_DESIGN.md "Part B
 * review fixes"): `openInvitation` opens a link and does so.
 */
export const SIGN_IN_CAMPAIGNS = campaigns;
export { SIGN_IN_ORIGIN };

/** The start page: where a join leaves the address. */
export const START = `${SIGN_IN_ORIGIN}/`;

/** An invitation's join path: the token rides in the fragment. */
export const joinPath = (token: string): string => `/join#${token}`;

/** The operator's `index`-th DM invitation of a campaign (each works once): its token. */
export const dmToken = (campaignId: string, index = 0): string =>
  dmInvitationToken(signInSeed(), campaignId, index);

/** The token of an invitation link. */
export const tokenOf = (link: string): string => link.slice(link.indexOf('#') + 1);

/** A well-formed token no invitation has. */
export const forgedToken = (): string => randomBytes(32).toString('base64url');

export const WORDS = {
  en: {
    players: 'Players',
    character: 'Character',
    create: 'Create invitation link',
    link: 'Invitation link',
    members: 'Players at the table',
    invitations: 'Open invitations',
    signOut: 'Sign out',
    signOutQuestion: 'Sign out?',
    stay: 'Stay signed in',
    signedOut: 'You are signed out',
    none: 'Sign in to your table',
    failed: 'This invitation cannot be used',
    invited: 'You are invited to a table',
    takeSeat: 'Take your seat',
    onlyBrowser: 'Only this browser',
    replaceQuestion: 'Replace your sign-in?',
    replace: 'Replace with this invitation',
    keep: 'Keep my current sign-in',
    revoke: (name: string) => `Revoke access: ${name}`,
    revokeYes: 'Yes, revoke access',
  },
  ru: {
    players: 'Игроки',
    character: 'Персонаж',
    create: 'Создать ссылку-приглашение',
    link: 'Ссылка-приглашение',
    members: 'Игроки за столом',
    invitations: 'Открытые приглашения',
    signOut: 'Выйти',
    signOutQuestion: 'Выйти?',
    stay: 'Остаться',
    signedOut: 'Вы вышли',
    none: 'Вход за игровой стол',
    failed: 'Это приглашение нельзя использовать',
    invited: 'Вас пригласили за стол',
    takeSeat: 'Занять место',
    onlyBrowser: 'Только этот браузер',
    replaceQuestion: 'Заменить вход?',
    replace: 'Заменить приглашением',
    keep: 'Оставить текущий вход',
    revoke: (name: string) => `Отозвать доступ: ${name}`,
    revokeYes: 'Да, отозвать доступ',
  },
} as const;

export type Words = (typeof WORDS)[keyof typeof WORDS];

/** The panel's state: its title and what it says (the sign-in screens). */
export const accessState = (page: Page, title: string) =>
  page.getByRole('group', { name: title, exact: true });

/**
 * "Take your seat" on the join page, the one moment the invitation is sent: without a login, in
 * this browser only (accounts have their own journeys, `accounts.spec.ts`).
 */
export async function takeSeat(page: Page, words: Words = WORDS.en): Promise<void> {
  const invited = accessState(page, words.invited);
  await invited.getByRole('radio', { name: words.onlyBrowser, exact: true }).check();
  await invited.getByRole('button', { name: words.takeSeat, exact: true }).click();
}

/** Opens an invitation link (`path` or a whole link) and takes the seat. */
export async function openInvitation(
  page: Page,
  path: string,
  words: Words = WORDS.en,
): Promise<void> {
  await page.goto(path);
  await takeSeat(page, words);
}

/** The DM signs in with the operator's link and reaches the world, the Players sheet beside it. */
export async function joinAsDm(
  page: Page,
  campaignId: string,
  index = 0,
  words: Words = WORDS.en,
): Promise<void> {
  await openInvitation(page, joinPath(dmToken(campaignId, index)), words);
  await expect(dockButton(page, words.players)).toBeVisible();
}

/** The DM invites a player for a character: the link, as the Players sheet shows it once. */
export async function invite(page: Page, character: string, words: Words = WORDS.en) {
  await openSheet(page, words.players);
  const sheet = page.locator('#sheet-players');
  await sheet.getByLabel(words.character, { exact: true }).selectOption({ label: character });
  await sheet.getByRole('button', { name: words.create, exact: true }).click();
  const field = sheet.getByLabel(words.link, { exact: true });
  await expect(field).toHaveValue(/^http:\/\/127\.0\.0\.1:4312\/join#[A-Za-z0-9_-]{43}$/);
  return field.inputValue();
}

/** Whether a text holds any of the tokens (asserted as yes/no, so no token is ever printed). */
export const holdsAny = (text: string, tokens: readonly string[]): boolean =>
  tokens.some((token) => text.includes(token));

/** Every request a browser context sends: its URL, method and body. */
export function captureRequests(context: BrowserContext) {
  const sent: { readonly url: string; readonly method: string; readonly body: string }[] = [];
  context.on('request', (request) => {
    sent.push({ url: request.url(), method: request.method(), body: request.postData() ?? '' });
  });
  return {
    sent,
    /**
     * No request's URL ever carried a token, and a body carried one only in a redeem — the one
     * place it travels (a POST to this origin).
     */
    expectTokensOnlyInRedeems(tokens: readonly string[]) {
      const inUrls = sent.filter((request) => holdsAny(request.url, tokens)).length;
      expect(inUrls, 'requests whose URL carries a token').toBe(0);
      const elsewhere = sent.filter(
        (request) =>
          holdsAny(request.body, tokens) &&
          !(request.method === 'POST' && request.url === `${SIGN_IN_ORIGIN}/api/auth/redeem`),
      ).length;
      expect(elsewhere, 'requests outside a redeem whose body carries a token').toBe(0);
    },
  };
}

/**
 * Nothing of a token stays where the page could keep it: the address and this history entry's
 * state, the navigation and resource timing entries (the browser keeps the address a page opened
 * with, fragment included: a join page gives way to a fresh start page once it is done), browser
 * storage, the cookies script can read (the session cookie is HttpOnly), IndexedDB, Cache
 * Storage, a service worker, the document.
 */
export async function expectNothingKept(page: Page, tokens: readonly string[]): Promise<void> {
  expect(page.url()).toBe(START);
  const kept = await page.evaluate(async () => {
    const cached = await Promise.all(
      (await caches.keys()).map(async (name) =>
        (await (await caches.open(name)).keys()).map((request) => request.url),
      ),
    );
    return {
      href: location.href,
      state: JSON.stringify(history.state),
      timing: performance
        .getEntries()
        .map((entry) => entry.name)
        .join('\n'),
      storage: JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
      cookie: document.cookie,
      databases: (await indexedDB.databases()).length,
      caches: cached.length,
      cached: cached.flat().join('\n'),
      workers: (await navigator.serviceWorker.getRegistrations()).length,
      document: document.documentElement.outerHTML,
    };
  });
  expect(holdsAny(kept.href, tokens), 'the address keeps a token').toBe(false);
  expect(holdsAny(kept.state, tokens), 'the history entry keeps a token').toBe(false);
  expect(holdsAny(kept.timing, tokens), 'a timing entry keeps a token').toBe(false);
  expect(holdsAny(kept.storage, tokens), 'browser storage keeps a token').toBe(false);
  expect(holdsAny(kept.cookie, tokens), 'a script-visible cookie keeps a token').toBe(false);
  expect(kept.cookie, 'the session cookie is HttpOnly').not.toContain('ltw_session');
  expect(kept.databases, 'IndexedDB databases').toBe(0);
  expect(kept.caches, 'Cache Storage caches').toBe(0);
  expect(holdsAny(kept.cached, tokens), 'Cache Storage keeps a token').toBe(false);
  expect(kept.workers, 'service workers').toBe(0);
  expect(holdsAny(kept.document, tokens), 'the document keeps a token').toBe(false);
}

/**
 * The page cannot reach the tokens any more: its JavaScript heap holds none (a heap snapshot after
 * a full garbage collection, through Chromium's DevTools protocol). Run it before anything reads
 * the page, so no answer of the check itself is in the heap.
 */
export async function expectUnreachable(page: Page, tokens: readonly string[]): Promise<void> {
  expect(await heapHoldsAny(page, tokens), 'the JavaScript heap keeps a token').toBe(false);
}

/** Whether the page's JavaScript heap holds any of the tokens (a heap snapshot, chunk by chunk). */
export async function heapHoldsAny(page: Page, tokens: readonly string[]): Promise<boolean> {
  const longest = Math.max(...tokens.map((token) => token.length));
  const session = await page.context().newCDPSession(page);
  let carried = '';
  let found = false;
  session.on('HeapProfiler.addHeapSnapshotChunk', ({ chunk }) => {
    const text = carried + chunk;
    if (holdsAny(text, tokens)) found = true;
    carried = text.slice(-longest);
  });
  try {
    await session.send('HeapProfiler.enable');
    await session.send('HeapProfiler.collectGarbage');
    await session.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  } finally {
    await session.detach();
  }
  return found;
}
