import { describe, expect, it, vi } from 'vitest';

import { ApiError, WorldApi } from './client.ts';

const connection = { campaignId: 'my world', token: 'private-token' };
const signal = new AbortController().signal;

describe('the browser API boundary', () => {
  it('calls fetch without binding a receiver and keeps credentials out of URLs/caches', async () => {
    const transport = vi.fn(function (this: unknown, input: unknown, init?: RequestInit) {
      expect(this).toBeUndefined();
      expect(input).toBe('/api/campaigns/my%20world/entities?perspective=CHARACTER%3Aelowen');
      expect(init).toMatchObject({
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        headers: { Authorization: 'Bearer private-token' },
      });
      return Promise.resolve(Response.json({ perspective: 'CHARACTER:elowen', entities: [] }));
    });
    const api = new WorldApi(connection, 'CHARACTER:elowen', 'CHARACTER:elowen', transport);
    await expect(api.get('entities', signal)).resolves.toEqual({
      perspective: 'CHARACTER:elowen',
      entities: [],
    });
  });

  it('fails closed when a response has another perspective or no envelope', async () => {
    for (const body of [{ perspective: 'DM', knowledge: ['secret'] }, {}, null]) {
      const api = new WorldApi(connection, 'PLAYER', 'CHARACTER:elowen', () =>
        Promise.resolve(Response.json(body)),
      );
      await expect(api.get('entities', signal)).rejects.toBeInstanceOf(ApiError);
    }
  });

  it('accepts the server-resolved PLAYER label and identity responses without perspective', async () => {
    const api = new WorldApi(connection, 'PLAYER', 'CHARACTER:elowen', () =>
      Promise.resolve(Response.json({ perspective: 'CHARACTER:elowen' })),
    );
    await expect(api.get('entities', signal)).resolves.toEqual({ perspective: 'CHARACTER:elowen' });
    const identity = new WorldApi(connection, '', '', () =>
      Promise.resolve(Response.json({ role: 'PLAYER' })),
    );
    await expect(identity.get('session', signal, false)).resolves.toEqual({ role: 'PLAYER' });
  });

  it('never surfaces server error text, thrown credentials, or invalid JSON', async () => {
    const attempts: (typeof fetch)[] = [
      () => Promise.resolve(new Response('DM_SECRET private-token', { status: 500 })),
      () => Promise.reject(new Error('private-token')),
      () => Promise.resolve(new Response('not JSON')),
    ];
    for (const transport of attempts) {
      const api = new WorldApi(connection, 'PLAYER', 'CHARACTER:elowen', transport);
      await expect(api.get('entities', signal)).rejects.toThrow(
        'The world could not be reached. Please try again.',
      );
    }
  });
});
