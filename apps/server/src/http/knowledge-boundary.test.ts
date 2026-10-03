import type { KnownEntitiesResponse, KnowledgeListResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import knowledgeSeed from '../../../../fixtures/ravenford/knowledge-seed.json' with { type: 'json' };
import {
  ASHEN_CIRCLE_ID,
  EXPECTED_VISIBLE,
  FORBIDDEN_MARKERS,
  TOKENS,
  get,
  ravenfordApp,
  withoutRequestId,
} from '../testing/ravenford-app.ts';

/**
 * Gate 01 evidence over HTTP: for every non-DM perspective, crawl every
 * endpoint with every record ID, entity ID, filter, and depth, and assert
 * the exact permitted records come back and no forbidden text ever does.
 */
let app: FastifyInstance;
let entityIds: string[];
const KNOWLEDGE_IDS = knowledgeSeed.commands.flatMap((command) =>
  'knowledgeId' in command && typeof command.knowledgeId === 'string' ? [command.knowledgeId] : [],
);
const BASE = '/campaigns/ravenford';

beforeAll(async () => {
  app = await ravenfordApp();
  const all = await get(app, `${BASE}/entities?perspective=DM`, TOKENS.dm);
  entityIds = all.json<KnownEntitiesResponse>().entities.map((ref) => ref.entityId);
});

afterAll(async () => {
  await app.close();
});

/** [label in the boundary spec, token, perspective parameter] */
const PERSPECTIVES: [string, string, string][] = [
  ['PUBLIC', TOKENS.player, 'PUBLIC'],
  ['PARTY', TOKENS.player, 'PARTY'],
  ['CHARACTER:elowen-starwhisper', TOKENS.player, 'PLAYER'],
  ['CHARACTER:elowen-starwhisper', TOKENS.player, 'CHARACTER:elowen-starwhisper'],
  ['PUBLIC', TOKENS.dm, 'PUBLIC'],
  ['PARTY', TOKENS.dm, 'PARTY'],
  ['CHARACTER:elowen-starwhisper', TOKENS.dm, 'CHARACTER:elowen-starwhisper'],
  ['NPC:mira-vale', TOKENS.dm, 'NPC:mira-vale'],
  ['NPC:orin-stonebeard', TOKENS.dm, 'NPC:orin-stonebeard'],
  ['NPC:captain-thorne', TOKENS.dm, 'NPC:captain-thorne'],
];

async function crawl(token: string, perspective: string): Promise<string[]> {
  const p = `perspective=${encodeURIComponent(perspective)}`;
  const ids = [...KNOWLEDGE_IDS, 'no-such-record'];
  const entities = [...entityIds, 'no-such-entity', ASHEN_CIRCLE_ID];
  const urls = [
    `${BASE}/knowledge?${p}`,
    ...['FACT', 'SECRET', 'HYPOTHESIS', 'TESTIMONY', 'RUMOR', 'UNKNOWN'].map(
      (type) => `${BASE}/knowledge?${p}&type=${type}`,
    ),
    ...entities.map((id) => `${BASE}/knowledge?${p}&about=${id}`),
    ...['-200000', '0', '34200', '36000', '99999999'].map(
      (asOf) => `${BASE}/knowledge?${p}&asOf=${asOf}`,
    ),
    ...ids.map((id) => `${BASE}/knowledge/${id}?${p}`),
    ...ids.flatMap((id) =>
      [1, 2, 3].map((depth) => `${BASE}/knowledge/${id}/related?${p}&depth=${String(depth)}`),
    ),
    `${BASE}/entities?${p}`,
    ...entities.map((id) => `${BASE}/entities/${id}/knowledge?${p}`),
  ];
  const responses = await Promise.all(urls.map((url) => get(app, url, token)));
  return responses.map(
    (response, index) => `${String(response.statusCode)} ${urls[index] ?? ''} ${response.body}`,
  );
}

describe.each(PERSPECTIVES)('HTTP perspective %s (token %s, %s)', (label, token, perspective) => {
  it('lists exactly the permitted records', async () => {
    const response = await get(app, `${BASE}/knowledge?perspective=${perspective}`, token);
    expect(response.statusCode).toBe(200);
    const ids = response.json<KnowledgeListResponse>().knowledge.map((view) => view.knowledgeId);
    expect([...ids].sort()).toEqual([...(EXPECTED_VISIBLE[label] ?? [])].sort());
  });

  it('never returns forbidden text from any endpoint, filter, or ID', async () => {
    const bodies = await crawl(token, perspective);
    const leaks = (FORBIDDEN_MARKERS[label] ?? []).flatMap((marker) =>
      bodies
        .filter((body) => body.split(' ').slice(2).join(' ').includes(marker))
        .map((body) => `${marker} in ${body.slice(0, 160)}`),
    );
    expect(leaks).toEqual([]);
  });

  it('answers hidden and nonexistent IDs identically', async () => {
    const visible = new Set(EXPECTED_VISIBLE[label]);
    const p = `perspective=${perspective}`;
    const baseline = withoutRequestId(
      await get(app, `${BASE}/knowledge/no-such-record?${p}`, token),
    );
    expect(baseline).toEqual({ status: 404, error: { code: 'NOT_FOUND', message: 'Not found' } });
    for (const id of KNOWLEDGE_IDS.filter((candidate) => !visible.has(candidate))) {
      expect(withoutRequestId(await get(app, `${BASE}/knowledge/${id}?${p}`, token))).toEqual(
        baseline,
      );
      expect(
        withoutRequestId(await get(app, `${BASE}/knowledge/${id}/related?${p}`, token)),
      ).toEqual(baseline);
    }
    const entityBaseline = withoutRequestId(
      await get(app, `${BASE}/entities/no-such-entity/knowledge?${p}`, token),
    );
    expect(
      withoutRequestId(await get(app, `${BASE}/entities/${ASHEN_CIRCLE_ID}/knowledge?${p}`, token)),
    ).toEqual(entityBaseline);
  });
});

describe('caches and interleaving', () => {
  it('keeps perspectives isolated under concurrent, interleaved requests', async () => {
    const requests = Array.from({ length: 60 }, (_, i) => {
      const asDm = i % 3 === 0;
      return {
        asDm,
        promise: get(
          app,
          `${BASE}/knowledge?perspective=${asDm ? 'DM' : i % 3 === 1 ? 'PARTY' : 'PLAYER'}`,
          asDm ? TOKENS.dm : TOKENS.player,
        ),
      };
    });
    for (const { asDm, promise } of requests) {
      const body = (await promise).body;
      expect(body.includes('Ashen'), asDm ? 'DM sees the truth' : 'player must not').toBe(asDm);
    }
  });

  it('marks every response as uncacheable and per-user', async () => {
    for (const response of [
      await get(app, `${BASE}/knowledge?perspective=PARTY`, TOKENS.player),
      await get(app, `${BASE}/knowledge/truth-cargo?perspective=PARTY`, TOKENS.player),
      await get(app, `${BASE}/knowledge?perspective=DM`, TOKENS.dm),
      await get(app, `${BASE}/knowledge?perspective=PARTY`),
    ]) {
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['vary']).toBe('Authorization');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    }
  });
});

describe('DM view', () => {
  it('returns every record with provenance and hidden relations', async () => {
    const response = await get(
      app,
      `${BASE}/knowledge/party-mira-departure?perspective=DM`,
      TOKENS.dm,
    );
    expect(response.json()).toMatchObject({
      perspective: 'DM',
      knowledge: {
        relations: [{ type: 'DERIVED_FROM', knowledgeId: 'mira-departure' }],
        origin: { actorId: 'dm-ravenford' },
      },
    });
    const all = await get(app, `${BASE}/knowledge?perspective=DM`, TOKENS.dm);
    expect(all.json<KnowledgeListResponse>().knowledge).toHaveLength(KNOWLEDGE_IDS.length);
  });
});
