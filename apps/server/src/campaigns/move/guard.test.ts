import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { isAwayRefusal, registerMoveGuard } from './guard.ts';
import type { CampaignMoves } from './moves.ts';

/**
 * An away campaign is read, not changed (docs/adr/0061-local-mode.md §5): a change to it is 409
 * `MOVED` before its handler runs; reading it, opening it from the account and changing another
 * campaign pass; PostgreSQL's refusal of an away write is recognised for the error handler.
 */
const AWAY: CampaignMoves = {
  awayOf: (campaignId) =>
    Promise.resolve(
      campaignId === 'ravenford'
        ? { destination: 'MacBook', movedAt: '2026-11-04T10:00:00Z' }
        : null,
    ),
};

function app() {
  const server = Fastify();
  registerMoveGuard(server, AWAY);
  const handled: string[] = [];
  server.get('/campaigns/:campaignId/lobby', () => Promise.resolve({ read: true }));
  server.post('/campaigns/:campaignId/chat', (request) => {
    handled.push(request.url);
    return Promise.resolve({ written: true });
  });
  server.delete('/campaigns/:campaignId/music/:trackId', () => Promise.resolve({ deleted: true }));
  server.post('/account/campaigns/:campaignId/enter', () => Promise.resolve({ entered: true }));
  return { server, handled };
}

describe('the move guard', () => {
  it('refuses a change to an away campaign and lets the rest through', async () => {
    const { server, handled } = app();
    const chat = await server.inject({
      method: 'POST',
      url: '/campaigns/ravenford/chat',
      payload: {},
    });
    expect(chat.statusCode).toBe(409);
    expect(chat.json()).toMatchObject({ error: { code: 'MOVED' } });
    expect(handled).toEqual([]);
    expect(
      (await server.inject({ method: 'DELETE', url: '/campaigns/ravenford/music/t-1' })).statusCode,
    ).toBe(409);
    expect(
      (await server.inject({ method: 'GET', url: '/campaigns/ravenford/lobby' })).statusCode,
    ).toBe(200);
    expect(
      (await server.inject({ method: 'POST', url: '/account/campaigns/ravenford/enter' }))
        .statusCode,
    ).toBe(200);
    expect(
      (await server.inject({ method: 'POST', url: '/campaigns/hollowmere/chat', payload: {} }))
        .statusCode,
    ).toBe(200);
    expect(handled).toEqual(['/campaigns/hollowmere/chat']);
  });

  it('recognises PostgreSQL’s refusal of an away campaign’s write', () => {
    expect(
      isAwayRefusal({
        code: '55000',
        message: 'ltw campaign ravenford is away: its history takes no appends here',
      }),
    ).toBe(true);
    expect(isAwayRefusal({ code: '55000', message: 'something else' })).toBe(false);
    expect(isAwayRefusal({ code: '23505', message: 'ltw campaign ravenford is away' })).toBe(false);
    expect(isAwayRefusal(null)).toBe(false);
  });
});
