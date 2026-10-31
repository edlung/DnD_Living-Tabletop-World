import { describe, expect, it } from 'vitest';

import { signOut } from './sign-in-flow.ts';

describe('a logout bound to the mounted game identity', () => {
  it('sends campaign and first observed actor as headers, with no identity probe or credential body', async () => {
    const calls: { url: unknown; init?: RequestInit }[] = [];
    const transport: typeof fetch = (url, init) => {
      calls.push({ url, ...(init ? { init } : {}) });
      return Promise.resolve(new Response(null, { status: 204 }));
    };
    await expect(
      signOut(transport, { campaignId: 'ravenford', actorId: 'original-dm' }),
    ).resolves.toBe('signed-out');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: '/api/auth/sign-out',
      init: {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        body: '{}',
        headers: {
          'Content-Type': 'application/json',
          'x-game-campaign': 'ravenford',
          'x-game-actor': 'original-dm',
        },
      },
    });
    expect(new Headers(calls[0]?.init?.headers).has('Authorization')).toBe(false);
  });

  it('binds the campaign even when no actor has yet been shown', async () => {
    let seen: Headers | null = null;
    const transport: typeof fetch = (_url, init) => {
      seen = new Headers(init?.headers);
      return Promise.resolve(new Response(null, { status: 204 }));
    };
    await signOut(transport, { campaignId: 'ravenford' });
    expect(seen).toEqual(
      new Headers({ 'Content-Type': 'application/json', 'x-game-campaign': 'ravenford' }),
    );
  });

  it('clears the old mounted world on a guarded conflict without trying to sign out the replacement', async () => {
    let calls = 0;
    const transport: typeof fetch = () => {
      calls += 1;
      return Promise.resolve(new Response(null, { status: 409 }));
    };
    await expect(signOut(transport, { campaignId: 'ravenford', actorId: 'old-dm' })).resolves.toBe(
      'signed-out',
    );
    expect(calls).toBe(1);
    await expect(signOut(transport)).resolves.toBe('failed');
  });

  it('forwards cancellation so a released dialog does not own a later response', async () => {
    const controller = new AbortController();
    let observed: AbortSignal | null | undefined;
    const transport: typeof fetch = (_url, init) => {
      observed = init?.signal;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            reject(new Error('aborted'));
          },
          { once: true },
        );
      });
    };
    const pending = signOut(transport, { campaignId: 'ravenford' }, controller.signal);
    controller.abort();
    await expect(pending).resolves.toBe('failed');
    expect(observed?.aborted).toBe(true);
  });
});
