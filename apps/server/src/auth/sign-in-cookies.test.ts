import type { MembershipResponse } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { withoutRequestId } from '../testing/ravenford-app.ts';
import { SEREN, sessionCookieOf, signInTable, type SignInTable } from '../testing/sign-in.ts';
import { newToken } from './tokens.ts';

/**
 * The session cookie is the browser's only credential (docs/adr/0036-production-sign-in.md,
 * amendment 2026-10-16): nothing another site can make the browser request removes it, a
 * request that presented none is never answered with a clearing cookie, and a sign-in never
 * silently replaces a working session.
 */
const UNAUTHENTICATED = {
  status: 401,
  error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
};
const FORBIDDEN = { status: 403, error: { code: 'FORBIDDEN', message: 'Not permitted' } };
const CONFLICT = { status: 409, error: { code: 'CONFLICT', message: 'Conflict' } };
const CLEARED = 'ltw_session=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0; Secure';

/** A link on another site, followed: the strict cookie stays home, and no `Origin` is sent. */
const CROSS_SITE_NAVIGATION = {
  'sec-fetch-site': 'cross-site',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
};

/** The session probe as the client's own same-origin fetch sends it: fetch metadata, no Origin. */
const probe = (table: SignInTable, cookie?: string, method: 'GET' | 'HEAD' = 'GET') =>
  table.app.inject({
    method,
    url: '/auth/session',
    headers: { 'sec-fetch-site': 'same-origin', ...(cookie === undefined ? {} : { cookie }) },
  });

describe('the session probe', () => {
  it('refuses a cross-site request before anything else, never touching the cookie', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    for (const method of ['GET', 'HEAD'] as const) {
      for (const headers of [
        CROSS_SITE_NAVIGATION,
        { 'sec-fetch-site': 'same-site' },
        { 'sec-fetch-site': 'none' },
        { origin: 'https://evil.example' },
        { origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' },
        {},
      ]) {
        const answer = await table.app.inject({ method, url: '/auth/session', headers });
        expect(answer.statusCode, `${method} ${JSON.stringify(headers)}`).toBe(403);
        if (method === 'GET') expect(withoutRequestId(answer)).toEqual(FORBIDDEN);
        expect(answer.headers['set-cookie']).toBeUndefined();
      }
    }
    // The browser is still signed in, and its session too.
    const still = await probe(table, dm);
    expect(still.json()).toEqual({ campaignId: 'ravenford' });
    expect(still.headers['set-cookie']).toBeUndefined();
  });

  it('clears the cookie only when the request presented one that opens nothing', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    const { token } = await table.invite(dm, SEREN);
    const player = await table.signInWith(token);
    // Nothing presented, or only other cookies: signed out, nothing to clear.
    for (const cookie of [undefined, 'theme=dark']) {
      const answer = await probe(table, cookie);
      expect(withoutRequestId(answer)).toEqual(UNAUTHENTICATED);
      expect(answer.headers['set-cookie']).toBeUndefined();
    }
    expect((await probe(table, undefined, 'HEAD')).headers['set-cookie']).toBeUndefined();
    // Two session cookies are ambiguous: refused, and neither is cleared.
    const two = await probe(table, `${dm}; ltw_session=${newToken()}`);
    expect(two.statusCode).toBe(401);
    expect(two.headers['set-cookie']).toBeUndefined();
    // One that opens nothing (forged, malformed, revoked, a released seat's) is cleared.
    await table.send('POST', `/campaigns/ravenford/members/${SEREN}/revoke`, { cookie: dm }, {});
    for (const cookie of [`ltw_session=${newToken()}`, 'ltw_session=short', `x=1; ${player}`]) {
      const answer = await probe(table, cookie);
      expect(withoutRequestId(answer), cookie).toEqual(UNAUTHENTICATED);
      expect(answer.headers['set-cookie']).toBe(CLEARED);
    }
    // A live one is answered and kept.
    const live = await probe(table, dm);
    expect(live.statusCode).toBe(200);
    expect(live.headers['set-cookie']).toBeUndefined();
  });
});

describe('signing out', () => {
  it('answers a request without a session cookie without any cookie', async () => {
    const table = await signInTable();
    const none = await table.send('POST', '/auth/sign-out', {});
    expect(withoutRequestId(none)).toEqual(UNAUTHENTICATED);
    expect(none.headers['set-cookie']).toBeUndefined();
    const stale = await table.send('POST', '/auth/sign-out', {
      cookie: `ltw_session=${newToken()}`,
    });
    expect(withoutRequestId(stale)).toEqual(UNAUTHENTICATED);
    expect(stale.headers['set-cookie']).toBe(CLEARED);
  });
});

const invitationStatus = async (table: SignInTable, dm: string, invitationId: string) =>
  (await table.send('GET', '/campaigns/ravenford/invitations', { cookie: dm }))
    .json<MembershipResponse>()
    .invitations.find((invitation) => invitation.invitationId === invitationId)?.status;

describe('a sign-in in a browser that is signed in', () => {
  it('asks first: 409, the invitation unused, the seat empty and the session untouched', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    const { invitation, token } = await table.invite(dm, SEREN);
    // The DM opens the player's link in their own browser by mistake.
    for (const extra of [{}, { replaceSession: false }]) {
      const conflict = await table.redeem(token, { cookie: dm }, extra);
      expect(withoutRequestId(conflict), JSON.stringify(extra)).toEqual(CONFLICT);
      expect(conflict.headers['set-cookie']).toBeUndefined();
    }
    expect(await invitationStatus(table, dm, invitation.invitationId)).toBe('pending');
    expect((await table.engine.load('ravenford'))?.state.roster.has(SEREN)).toBe(false);
    expect((await probe(table, dm)).statusCode).toBe(200);
    // Confirmed (the join page asked): the new session replaces the old one.
    const replaced = await table.redeem(token, { cookie: dm }, { replaceSession: true });
    expect(replaced.statusCode).toBe(200);
    expect((await probe(table, dm)).statusCode).toBe(401);
    expect((await probe(table, sessionCookieOf(replaced) ?? '')).statusCode).toBe(200);
  });

  it('needs no confirmation once the browser’s session no longer works', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    const { token } = await table.invite(dm, SEREN);
    const player = await table.signInWith(token);
    await table.send('POST', `/campaigns/ravenford/members/${SEREN}/revoke`, { cookie: dm }, {});
    // The revoked player's browser joins again with a new link.
    const again = await table.invite(dm, SEREN);
    expect((await table.redeem(again.token, { cookie: player })).statusCode).toBe(200);
    const forged = `ltw_session=${newToken()}`;
    expect((await table.redeem(await table.dmInvitation(), { cookie: forged })).statusCode).toBe(
      200,
    );
  });

  it('refuses a malformed confirmation like any malformed body', async () => {
    const table = await signInTable();
    const token = await table.dmInvitation();
    for (const replaceSession of ['yes', 1, null]) {
      const answer = await table.redeem(token, {}, { replaceSession });
      expect(answer.statusCode, String(replaceSession)).toBe(400);
    }
    expect((await table.redeem(token, {}, { replaceSession: true })).statusCode).toBe(200);
  });

  it('counts a request waiting for confirmation as no refused guess', async () => {
    const table = await signInTable({ limits: { refusedRedeemsPerMinute: 2 } });
    const dm = await table.signInWith(await table.dmInvitation());
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await table.redeem(await table.dmInvitation(), { cookie: dm })).statusCode).toBe(409);
    }
    // The minute's refusal budget is untouched: another client still signs in.
    expect(
      (await table.redeem(await table.dmInvitation(), { ip: '198.51.100.40' })).statusCode,
    ).toBe(200);
  });
});
