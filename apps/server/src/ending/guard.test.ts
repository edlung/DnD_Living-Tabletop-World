import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { InMemoryEndingStore } from './ending-store.ts';
import { registerFinishedGuard } from './guard.ts';

/**
 * A finished campaign is read, not played (docs/adr/0072-keepsakes.md §2): a request that would
 * change it is refused with 409 `FINISHED` before it is handled, but for the few its end still
 * takes — and a route nobody named is refused too.
 */
async function app() {
  const store = new InMemoryEndingStore();
  await store.finish({ campaignId: 'ravenford', finishedAt: '2026-11-16T10:00:00.000Z', line: '' });
  const server = Fastify();
  registerFinishedGuard(server, store);
  const handled: string[] = [];
  const taken = (request: { url: string }) => {
    handled.push(request.url);
    return Promise.resolve({ taken: true });
  };
  server.get('/campaigns/:campaignId/chronicle', () => Promise.resolve({ read: true }));
  server.post('/campaigns/:campaignId/commands', taken);
  server.post('/campaigns/:campaignId/a-route-added-later', taken);
  server.post('/campaigns/:campaignId/keepsakes', taken);
  server.post('/campaigns/:campaignId/ending', taken);
  server.post('/campaigns/:campaignId/reflections', taken);
  server.post('/account/campaigns/:campaignId/enter', taken);
  return { server, store, handled };
}

describe('the finished guard', () => {
  it('refuses play in a finished campaign and takes what its end still takes', async () => {
    const { server, store, handled } = await app();
    const post = (url: string) => server.inject({ method: 'POST', url, payload: {} });
    for (const path of ['commands', 'a-route-added-later']) {
      const refused = await post(`/campaigns/ravenford/${path}`);
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toMatchObject({ error: { code: 'FINISHED' } });
    }
    expect(handled).toEqual([]);
    expect(
      (await server.inject({ method: 'GET', url: '/campaigns/ravenford/chronicle' })).statusCode,
    ).toBe(200);
    for (const url of [
      '/campaigns/ravenford/keepsakes',
      '/campaigns/ravenford/ending',
      '/campaigns/ravenford/reflections',
      '/account/campaigns/ravenford/enter',
      // Another campaign plays on.
      '/campaigns/hollowmere/commands',
    ]) {
      expect((await post(url)).statusCode, url).toBe(200);
    }
    // Reopened, it is played again.
    await store.reopen('ravenford');
    expect((await post('/campaigns/ravenford/commands')).statusCode).toBe(200);
  });
});
