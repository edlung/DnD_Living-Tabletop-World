import { describe, expect, it, vi } from 'vitest';

import { takeInvitation } from './invitation-link.ts';
import {
  describeSignIn,
  firstStep,
  probeSession,
  redeemInvitation,
  signOut,
} from './sign-in-flow.ts';

/**
 * Production sign-in from the browser (docs/adr/0036-production-sign-in.md §7), over a fake
 * transport: the token leaves the address before any request and travels only in a body;
 * requests carry the session cookie to their own origin and never an `Authorization` header;
 * every failed invitation reads the same; a signed-in browser is asked before its sign-in is
 * replaced.
 */
const TOKEN = 'A'.repeat(21) + '_-' + 'z9'.repeat(10);
const json = (body: unknown, status = 200) => Response.json(body, { status });

interface Sent {
  readonly url: string;
  readonly init: RequestInit;
}

/** A request's JSON body (the client sends strings only). */
const bodyOf = (sent: Sent | undefined): unknown =>
  typeof sent?.init.body === 'string' ? JSON.parse(sent.init.body) : undefined;

function transport(...answers: (Response | Error)[]) {
  const sent: Sent[] = [];
  const fake = vi.fn(function (this: unknown, input: unknown, init?: RequestInit) {
    expect(this).toBeUndefined();
    sent.push({ url: String(input), init: init ?? {} });
    const answer = answers.shift() ?? new Error('no answer');
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  });
  return { fake, sent };
}

const expectSameOrigin = (sent: readonly Sent[]) => {
  for (const { url, init } of sent) {
    expect(url.startsWith('/api/')).toBe(true);
    expect(url).not.toContain(TOKEN);
    expect(init).toMatchObject({
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
    });
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
  }
};

describe('the invitation in the address', () => {
  const history = () => ({ replaceState: vi.fn() });

  it('is taken from the join link and removed from the address and history at once', () => {
    const replaced = history();
    expect(takeInvitation({ pathname: '/join', hash: `#${TOKEN}` }, replaced)).toEqual({
      kind: 'token',
      token: TOKEN,
    });
    expect(replaced.replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('reads a join link without a well-formed token as malformed, and removes it too', () => {
    for (const hash of ['', '#', '#short', `#${TOKEN}x`, `#${TOKEN.slice(1)}!`, `#${TOKEN} `]) {
      const replaced = history();
      expect(takeInvitation({ pathname: '/join/', hash }, replaced)).toEqual({
        kind: 'malformed',
      });
      expect(replaced.replaceState).toHaveBeenCalledTimes(1);
    }
  });

  it('leaves every other address alone', () => {
    for (const pathname of ['/', '/joined', '/join/more', '/another-local-page']) {
      const replaced = history();
      expect(takeInvitation({ pathname, hash: `#${TOKEN}` }, replaced)).toBeNull();
      expect(replaced.replaceState).not.toHaveBeenCalled();
    }
  });
});

describe('the session probe', () => {
  it('finds a live sign-in by a same-origin request', async () => {
    const { fake, sent } = transport(json({ campaignId: 'ravenford' }));
    await expect(probeSession(fake)).resolves.toEqual({
      kind: 'signed-in',
      campaignId: 'ravenford',
    });
    expect(sent.map((call) => call.url)).toEqual(['/api/auth/session']);
    expectSameOrigin(sent);
  });

  it('tells signed out (401) from development personas (no such route)', async () => {
    await expect(probeSession(transport(json({}, 401)).fake)).resolves.toEqual({
      kind: 'signed-out',
    });
    await expect(probeSession(transport(json({}, 404)).fake)).resolves.toEqual({
      kind: 'personas',
    });
  });

  it('calls anything else unreachable, an answer that names no campaign included', async () => {
    for (const answer of [
      json({}, 403),
      json({}, 500),
      new Error('offline'),
      new Response('not JSON'),
      json({ campaignId: '../other' }),
      json({ campaign: 'ravenford' }),
    ]) {
      await expect(probeSession(transport(answer).fake)).resolves.toEqual({
        kind: 'unreachable',
      });
    }
  });
});

describe('redeeming an invitation', () => {
  it('posts the token in a JSON body only and joins the campaign it opens', async () => {
    const { fake, sent } = transport(json({ campaignId: 'ui-signin' }));
    await expect(redeemInvitation(fake, TOKEN, false)).resolves.toEqual({
      kind: 'joined',
      campaignId: 'ui-signin',
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('/api/auth/redeem');
    expect(sent[0]?.init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(bodyOf(sent[0])).toEqual({ token: TOKEN });
    expectSameOrigin(sent);
  });

  it('asks first when the browser is signed in, then confirms the replacement', async () => {
    const asked = transport(json({ error: { code: 'CONFLICT' } }, 409));
    await expect(redeemInvitation(asked.fake, TOKEN, false)).resolves.toEqual({
      kind: 'needs-confirmation',
    });
    const confirmed = transport(json({ campaignId: 'ui-signin' }));
    await expect(redeemInvitation(confirmed.fake, TOKEN, true)).resolves.toEqual({
      kind: 'joined',
      campaignId: 'ui-signin',
    });
    expect(bodyOf(confirmed.sent[0])).toEqual({
      token: TOKEN,
      replaceSession: true,
    });
  });

  it('reads every other answer as the same failure, whatever its reason', async () => {
    for (const answer of [
      json({ error: { code: 'UNAUTHENTICATED' } }, 401),
      json({ error: { code: 'INVALID_REQUEST' } }, 400),
      json({ error: { code: 'RATE_LIMITED' } }, 429),
      json({ error: { code: 'FORBIDDEN' } }, 403),
      json({ error: { code: 'NOT_FOUND' } }, 404),
      json({}, 502),
      new Error('connection lost'),
      json({ nothing: true }),
    ]) {
      await expect(redeemInvitation(transport(answer).fake, TOKEN, false)).resolves.toEqual({
        kind: 'failed',
      });
    }
    // A confirmed replacement is never asked again.
    const again = transport(json({ error: { code: 'CONFLICT' } }, 409));
    await expect(redeemInvitation(again.fake, TOKEN, true)).resolves.toEqual({ kind: 'failed' });
  });
});

describe('the first step of a page', () => {
  it('redeems the invitation once, or probes the session without one', async () => {
    const joining = transport(json({ campaignId: 'ui-signin' }));
    await expect(firstStep({ kind: 'token', token: TOKEN }, joining.fake)).resolves.toEqual({
      kind: 'joined',
      campaignId: 'ui-signin',
    });
    expect(joining.sent.map((call) => call.url)).toEqual(['/api/auth/redeem']);
    const probing = transport(json({}, 401));
    await expect(firstStep(null, probing.fake)).resolves.toEqual({ kind: 'signed-out' });
    expect(probing.sent.map((call) => call.url)).toEqual(['/api/auth/session']);
  });

  it('keeps the token in memory only to ask about replacing a sign-in', async () => {
    const { fake } = transport(json({ error: { code: 'CONFLICT' } }, 409));
    await expect(firstStep({ kind: 'token', token: TOKEN }, fake)).resolves.toEqual({
      kind: 'confirm',
      token: TOKEN,
    });
  });

  it('fails a malformed link without a request, and a refused one the same way', async () => {
    const silent = transport();
    await expect(firstStep({ kind: 'malformed' }, silent.fake)).resolves.toEqual({
      kind: 'join-failed',
    });
    expect(silent.sent).toEqual([]);
    const refused = transport(json({ error: { code: 'UNAUTHENTICATED' } }, 401));
    await expect(firstStep({ kind: 'token', token: TOKEN }, refused.fake)).resolves.toEqual({
      kind: 'join-failed',
    });
  });
});

describe('signing out and naming the current sign-in', () => {
  it('signs out by a same-origin POST; no session left is signed out too', async () => {
    for (const status of [204, 401]) {
      const { fake, sent } = transport(new Response(null, { status }));
      await expect(signOut(fake)).resolves.toBe('signed-out');
      expect(sent[0]).toMatchObject({ url: '/api/auth/sign-out', init: { method: 'POST' } });
      expectSameOrigin(sent);
    }
    for (const answer of [json({}, 500), json({}, 403), new Error('offline')]) {
      await expect(signOut(transport(answer).fake)).resolves.toBe('failed');
    }
  });

  it('names the campaign and the role of the sign-in the browser holds', async () => {
    const { fake, sent } = transport(
      json({ campaignId: 'ravenford' }),
      json({
        role: 'PLAYER',
        campaign: { campaignId: 'ravenford', name: 'The Missing Caravan', language: 'en' },
        character: { entityId: 'elowen-starwhisper', kind: 'character', name: 'Elowen' },
      }),
    );
    await expect(describeSignIn(fake)).resolves.toEqual({
      campaignName: 'The Missing Caravan',
      role: 'PLAYER',
      characterName: 'Elowen',
    });
    expect(sent.map((call) => call.url)).toEqual([
      '/api/auth/session',
      '/api/campaigns/ravenford/session',
    ]);
    expectSameOrigin(sent);
  });

  it('names nothing when no sign-in is left or it cannot be read', async () => {
    await expect(describeSignIn(transport(json({}, 401)).fake)).resolves.toBeNull();
    await expect(
      describeSignIn(transport(json({ campaignId: 'ravenford' }), json({}, 401)).fake),
    ).resolves.toBeNull();
    await expect(
      describeSignIn(transport(json({ campaignId: 'ravenford' }), json({ role: 'X' })).fake),
    ).resolves.toBeNull();
  });
});
