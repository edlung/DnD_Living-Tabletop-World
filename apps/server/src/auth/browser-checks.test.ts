import { describe, expect, it } from 'vitest';

import { CONTENT_SECURITY_POLICY } from '../http/security.ts';
import { openLive } from '../testing/live.ts';
import { TOKENS, get, ravenfordApp, withoutRequestId } from '../testing/ravenford-app.ts';
import { ORIGIN, SEREN, signInTable } from '../testing/sign-in.ts';

/**
 * Browser-facing checks of invitation mode (docs/adr/0036-production-sign-in.md, "Cross-site
 * request", "Script injection"): every non-GET request and the live stream must come from the
 * public origin; JSON only; every response carries the security headers.
 */
const FORBIDDEN = { status: 403, error: { code: 'FORBIDDEN', message: 'Not permitted' } };
const LIVE = '/campaigns/ravenford/live?perspective=PARTY';

describe('the origin check', () => {
  it('refuses a request that changes something without the public origin, before anything else', async () => {
    const table = await signInTable();
    const token = await table.dmInvitation();
    for (const origin of [null, 'https://evil.example', 'https://table.example.evil', 'null']) {
      const answer = await table.redeem(token, { origin });
      expect(withoutRequestId(answer), String(origin)).toEqual(FORBIDDEN);
      expect(answer.headers['set-cookie']).toBeUndefined();
    }
    const dm = await table.signInWith(token);
    const versionBefore = (await table.engine.load('ravenford'))?.state.version;
    for (const [url, body] of [
      [
        '/campaigns/ravenford/commands',
        { commandId: 'time', command: { type: 'AdvanceWorldTime', by: 60 } },
      ],
      ['/campaigns/ravenford/invitations', { characterId: SEREN }],
      [`/campaigns/ravenford/members/${SEREN}/revoke`, {}],
      ['/auth/sign-out', {}],
    ] as const) {
      const foreign = await table.send(
        'POST',
        url,
        { cookie: dm, origin: 'https://evil.example' },
        body,
      );
      expect(withoutRequestId(foreign), url).toEqual(FORBIDDEN);
    }
    expect((await table.engine.load('ravenford'))?.state.version).toBe(versionBefore);
    expect((await table.send('GET', '/auth/session', { cookie: dm })).statusCode).toBe(200);
    // Reads need no origin: same-origin GETs carry none.
    const read = await table.send('GET', '/campaigns/ravenford/session', {
      cookie: dm,
      origin: null,
    });
    expect(read.statusCode).toBe(200);
  });

  it('opens the live stream only for the public origin or same-origin fetch metadata', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    const live = (headers: Record<string, string>) =>
      table.app.inject({ method: 'GET', url: LIVE, headers: { cookie: dm, ...headers } });
    for (const headers of [
      {},
      { origin: 'https://evil.example' },
      { 'sec-fetch-site': 'cross-site' },
      { 'sec-fetch-site': 'same-site' },
      { origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' },
    ]) {
      expect(withoutRequestId(await live(headers)), JSON.stringify(headers)).toEqual(FORBIDDEN);
    }
    expect(table.hub.size).toBe(0);
    for (const headers of [{ origin: ORIGIN }, { 'sec-fetch-site': 'same-origin' }]) {
      const stream = await openLive(table.app, LIVE, undefined, { cookie: dm, ...headers });
      expect(stream.status).toBe(200);
      await stream.until(() => stream.messages().some((message) => message.type === 'ready'));
      stream.disconnect();
    }
  });

  it('accepts JSON bodies only', async () => {
    const table = await signInTable();
    const answer = await table.app.inject({
      method: 'POST',
      url: '/auth/redeem',
      headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
      payload: `token=${await table.dmInvitation()}`,
    });
    expect(answer.statusCode).toBe(400);
    expect(answer.headers['set-cookie']).toBeUndefined();
  });

  it('is not needed with development personas, which browsers never send by themselves', async () => {
    const app = await ravenfordApp();
    expect((await get(app, '/campaigns/ravenford/session', TOKENS.dm)).statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: '/auth/redeem', payload: {} })).statusCode,
    ).toBe(404);
  });
});

describe('response headers', () => {
  it('carry the content security policy, no referrer and no sniffing, varying on the cookie', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    for (const response of [
      await table.send('GET', '/campaigns/ravenford/session', { cookie: dm }),
      await table.send('GET', '/campaigns/ravenford/session', {}),
      await table.redeem('x'.repeat(43)),
      await table.send('GET', '/nowhere', {}),
    ]) {
      expect(response.headers).toMatchObject({
        'content-security-policy': CONTENT_SECURITY_POLICY,
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
        vary: 'Cookie',
      });
    }
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    const stream = await openLive(table.app, LIVE, undefined, { cookie: dm, origin: ORIGIN });
    expect(stream.headers).toMatchObject({
      'content-security-policy': CONTENT_SECURITY_POLICY,
      'referrer-policy': 'no-referrer',
      vary: 'Cookie',
    });
    stream.disconnect();
  });

  it('are the same with personas, varying on the bearer header', async () => {
    const app = await ravenfordApp();
    const response = await get(app, '/campaigns/ravenford/session', TOKENS.player);
    expect(response.headers).toMatchObject({
      'content-security-policy': CONTENT_SECURITY_POLICY,
      'referrer-policy': 'no-referrer',
      vary: 'Authorization',
    });
  });
});
