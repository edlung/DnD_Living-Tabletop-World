import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ALL_SECRET_MARKERS,
  ASHEN_CIRCLE_ID,
  TOKENS,
  get,
  ravenfordApp,
  withoutRequestId,
} from '../testing/ravenford-app.ts';

/**
 * Missing, forged, and malformed scopes over HTTP (Gate 01 attack family 2).
 * Every failure is uniform for its class and carries no knowledge content.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const ROUTES = [
  `${BASE}/knowledge`,
  `${BASE}/knowledge/pub-golden-stag`,
  `${BASE}/knowledge/truth-cargo`,
  `${BASE}/knowledge/pub-golden-stag/related`,
  `${BASE}/entities`,
  `${BASE}/entities/mira-vale/knowledge`,
  `${BASE}/entities/${ASHEN_CIRCLE_ID}/knowledge`,
];

beforeAll(async () => {
  app = await ravenfordApp();
});

afterAll(async () => {
  await app.close();
});

const expectClean = (body: string) => {
  expect(ALL_SECRET_MARKERS.filter((marker) => body.includes(marker))).toEqual([]);
};

describe('authentication', () => {
  it.each([
    ['no header', undefined],
    ['unknown token', 'Bearer dev-unknown-token'],
    ['wrong scheme', `Basic ${TOKENS.dm}`],
    ['lowercase scheme', `bearer ${TOKENS.dm}`],
    ['empty bearer', 'Bearer '],
    ['token with suffix', `Bearer ${TOKENS.dm} x`],
    ['token as actor id', 'Bearer dm-ravenford'],
  ])('rejects %s with a uniform 401 on every route', async (_label, authorization) => {
    for (const route of ROUTES) {
      const response = await app.inject({
        method: 'GET',
        url: `${route}?perspective=DM`,
        headers: authorization === undefined ? {} : { authorization },
      });
      expect(withoutRequestId(response)).toEqual({
        status: 401,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
      expect(response.headers['www-authenticate']).toBe('Bearer');
    }
  });
});

describe('malformed perspectives and parameters', () => {
  it.each([
    '',
    '?perspective=',
    '?perspective=dm',
    '?perspective=Party',
    '?perspective=WORLD_TRUTH',
    '?perspective=NPC',
    '?perspective=NPC:Mira',
    '?perspective=NPC%3Amira-vale%00',
    '?perspective=PARTY%20',
    '?perspective=PARTY&perspective=DM',
    '?perspective=PARTY&scope=DM',
    '?perspective=PARTY&actor=dm-ravenford',
    '?perspective[kind]=DM',
    `?perspective=${'P'.repeat(5000)}`,
  ])('rejects %j with 400 and no content', async (query) => {
    for (const route of ROUTES) {
      const response = await get(app, `${route}${query}`, TOKENS.player);
      expect(withoutRequestId(response)).toEqual({
        status: 400,
        error: { code: 'INVALID_REQUEST', message: 'The request is invalid' },
      });
    }
  });

  it.each([
    '&type=fact',
    '&type=WORLD_TRUTH',
    '&about=Ashen-Circle',
    '&asOf=1e5',
    '&asOf=12.5',
    '&asOf=99999999999999',
    '&asOf=36001',
    '&depth=4',
  ])('rejects invalid filter %j', async (filter) => {
    const route = filter.startsWith('&depth')
      ? `${BASE}/knowledge/pub-golden-stag/related`
      : `${BASE}/knowledge`;
    const response = await get(app, `${route}?perspective=PARTY${filter}`, TOKENS.player);
    expect(response.statusCode).toBe(400);
  });

  it.each([
    `${BASE}/knowledge/Truth-Cargo`,
    `${BASE}/knowledge/truth%2Fcargo`,
    `${BASE}/knowledge/..`,
    `${BASE}/entities/Mira/knowledge`,
    '/campaigns/RAVENFORD/knowledge',
  ])('rejects malformed path %s before any lookup', async (route) => {
    const response = await get(app, `${route}?perspective=PARTY`, TOKENS.player);
    expect([400, 404]).toContain(response.statusCode);
    expectClean(response.body);
  });
});

describe('forged perspectives', () => {
  it.each([
    'DM',
    'NPC:mira-vale',
    'NPC:orin-stonebeard',
    'NPC:no-such-npc',
    `NPC:${ASHEN_CIRCLE_ID}`,
    'CHARACTER:mira-vale',
    'CHARACTER:no-such-character',
  ])('forbids the player %s identically on every route', async (perspective) => {
    for (const route of ROUTES) {
      const response = await get(app, `${route}?perspective=${perspective}`, TOKENS.player);
      expect(withoutRequestId(response)).toEqual({
        status: 403,
        error: { code: 'FORBIDDEN', message: 'Not permitted' },
      });
    }
  });

  it('hides the campaign from non-members exactly like a missing campaign', async () => {
    const missing = withoutRequestId(
      await get(app, '/campaigns/no-such-campaign/knowledge?perspective=PUBLIC', TOKENS.dm),
    );
    expect(missing).toEqual({ status: 404, error: { code: 'NOT_FOUND', message: 'Not found' } });
    for (const route of ROUTES) {
      for (const perspective of ['PUBLIC', 'PARTY', 'DM', 'PLAYER', 'NPC:mira-vale']) {
        const response = await get(app, `${route}?perspective=${perspective}`, TOKENS.outsider);
        expect(withoutRequestId(response)).toEqual(missing);
      }
    }
  });

  it('never lets the DM fall back to a broader view for unknown targets', async () => {
    for (const perspective of [
      'NPC:no-such-npc',
      'CHARACTER:mira-vale',
      `NPC:${ASHEN_CIRCLE_ID}`,
    ]) {
      const response = await get(app, `${BASE}/knowledge?perspective=${perspective}`, TOKENS.dm);
      expect(response.statusCode).toBe(404);
    }
    expect((await get(app, `${BASE}/knowledge?perspective=PLAYER`, TOKENS.dm)).statusCode).toBe(
      403,
    );
  });
});

describe('other methods', () => {
  it('applies the same checks to HEAD requests', async () => {
    const head = (perspective: string, token?: string) =>
      app.inject({
        method: 'HEAD',
        url: `${BASE}/knowledge?perspective=${perspective}`,
        headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
      });
    expect((await head('PARTY')).statusCode).toBe(401);
    expect((await head('DM', TOKENS.player)).statusCode).toBe(403);
    expect((await head('PUBLIC', TOKENS.outsider)).statusCode).toBe(404);
    expect((await head('PARTY', TOKENS.player)).statusCode).toBe(200);
  });
});

describe('request IDs', () => {
  it('ignores client-supplied request IDs', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${BASE}/knowledge?perspective=PARTY`,
      headers: { authorization: `Bearer ${TOKENS.player}`, 'x-request-id': 'client-chosen' },
    });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
