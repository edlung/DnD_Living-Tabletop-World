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
 * ever printed: assertions about tokens are yes/no, and the specs keep no trace or screenshot.
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
    none: 'Join with an invitation',
    failed: 'This invitation cannot be used',
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
    none: 'Вход по приглашению',
    failed: 'Это приглашение нельзя использовать',
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

/** The DM signs in with the operator's link and reaches the world, the Players sheet beside it. */
export async function joinAsDm(
  page: Page,
  campaignId: string,
  index = 0,
  words: Words = WORDS.en,
): Promise<void> {
  await page.goto(joinPath(dmToken(campaignId, index)));
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
 * Nothing of a token stays where the page could keep it: the address, browser storage, the
 * cookies script can read (the session cookie is HttpOnly), IndexedDB.
 */
export async function expectNothingKept(page: Page, tokens: readonly string[]): Promise<void> {
  expect(page.url()).toBe(START);
  const kept = await page.evaluate(async () => ({
    href: location.href,
    storage: JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
    cookie: document.cookie,
    databases: (await indexedDB.databases()).length,
  }));
  expect(holdsAny(kept.href, tokens), 'the address keeps a token').toBe(false);
  expect(holdsAny(kept.storage, tokens), 'browser storage keeps a token').toBe(false);
  expect(holdsAny(kept.cookie, tokens), 'a script-visible cookie keeps a token').toBe(false);
  expect(kept.cookie, 'the session cookie is HttpOnly').not.toContain('ltw_session');
  expect(kept.databases, 'IndexedDB databases').toBe(0);
}
