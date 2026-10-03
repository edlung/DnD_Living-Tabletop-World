import type { CommandResult, MemoryRecallResponse, SessionListResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import boundary from '../../../../fixtures/ravenford/memory-boundary.json' with { type: 'json' };
import memorySeed from '../../../../fixtures/ravenford/memory-seed.json' with { type: 'json' };
import { TOKENS, get, ravenfordApp, withoutRequestId } from '../testing/ravenford-app.ts';

/** Stage 30 memory retrieval over HTTP: the Gate 02 surface for memories. */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const VISIBLE: Record<string, readonly string[]> = boundary.visible;
const FORBIDDEN: Record<string, readonly string[]> = boundary.forbiddenMarkers;
const MEMORY_IDS = memorySeed.commands.flatMap((c) =>
  'memoryId' in c && typeof c.memoryId === 'string' ? [c.memoryId] : [],
);
const ENTITY_IDS = [
  'mira-vale',
  'orin-stonebeard',
  'captain-thorne',
  'elowen-starwhisper',
  'strange-symbol',
  'guild-caravan',
  'market-square',
  'north-gate',
  'orins-alchemy',
  'old-trade-road',
  'ravenford',
  'no-such-entity',
];

beforeAll(async () => {
  app = await ravenfordApp();
});

afterAll(async () => {
  await app.close();
});

const PERSPECTIVES: [string, string, string][] = [
  ['PUBLIC', TOKENS.player, 'PUBLIC'],
  ['PARTY', TOKENS.player, 'PARTY'],
  ['CHARACTER:elowen-starwhisper', TOKENS.player, 'PLAYER'],
  ['NPC:mira-vale', TOKENS.dm, 'NPC:mira-vale'],
  ['NPC:orin-stonebeard', TOKENS.dm, 'NPC:orin-stonebeard'],
  ['NPC:captain-thorne', TOKENS.dm, 'NPC:captain-thorne'],
];

describe.each(PERSPECTIVES)('memories for %s', (label, token, perspective) => {
  const p = `perspective=${perspective}`;

  it('recalls exactly the permitted memories', async () => {
    const response = await get(app, `${BASE}/memories?${p}&limit=50`, token);
    expect(response.statusCode).toBe(200);
    const body = response.json<MemoryRecallResponse>();
    expect(body.memories.map((m) => m.memory.memoryId).sort()).toEqual(
      [...(VISIBLE[label] ?? [])].sort(),
    );
    expect(body.total).toBe(VISIBLE[label]?.length);
  });

  it('never returns forbidden text through any query or ID', async () => {
    const urls = [
      ...[
        'traveller',
        'crate%20symbol',
        'patrol',
        'dawn',
        'nervously',
        'supplies',
        'caravan',
        'symbol',
      ].map((q) => `${BASE}/memories?${p}&q=${q}`),
      ...ENTITY_IDS.flatMap((id) => [
        `${BASE}/memories?${p}&entity=${id}`,
        `${BASE}/memories?${p}&location=${id}`,
      ]),
      ...['OBSERVATION', 'CONVERSATION', 'DISCOVERY', 'DECISION', 'CONSEQUENCE'].map(
        (kind) => `${BASE}/memories?${p}&kind=${kind}`,
      ),
      `${BASE}/memories?${p}&session=ravenford-s1`,
      `${BASE}/memories?${p}&from=-20000000&to=0`,
      `${BASE}/memories?${p}&asOf=-80000`,
      ...[...MEMORY_IDS, 'no-such-memory'].map((id) => `${BASE}/memories/${id}?${p}`),
    ];
    const bodies = await Promise.all(urls.map(async (url) => (await get(app, url, token)).body));
    const leaks = (FORBIDDEN[label] ?? []).filter((marker) =>
      bodies.some((body) => body.includes(marker)),
    );
    expect(leaks).toEqual([]);
  });

  it('answers hidden and nonexistent memories identically', async () => {
    const baseline = withoutRequestId(
      await get(app, `${BASE}/memories/no-such-memory?${p}`, token),
    );
    expect(baseline).toEqual({ status: 404, error: { code: 'NOT_FOUND', message: 'Not found' } });
    const visible = new Set(VISIBLE[label]);
    for (const id of MEMORY_IDS.filter((candidate) => !visible.has(candidate))) {
      expect(withoutRequestId(await get(app, `${BASE}/memories/${id}?${p}`, token))).toEqual(
        baseline,
      );
    }
  });
});

describe('memory request validation and access', () => {
  it.each([
    '&limit=0',
    '&limit=51',
    '&limit=ten',
    '&kind=observation',
    '&asOf=99999999',
    '&from=10&to=5',
    '&q=a&q=b',
    '&scope=DM',
    '&entity=Mira',
  ])('rejects %s with 400', async (suffix) => {
    const response = await get(app, `${BASE}/memories?perspective=PARTY${suffix}`, TOKENS.player);
    expect(response.statusCode).toBe(400);
  });

  it('forbids forged perspectives and hides the campaign from outsiders', async () => {
    for (const perspective of ['DM', 'NPC:orin-stonebeard', 'NPC:no-such-npc']) {
      expect(
        (await get(app, `${BASE}/memories?perspective=${perspective}`, TOKENS.player)).statusCode,
      ).toBe(403);
    }
    expect(
      (await get(app, `${BASE}/memories?perspective=PUBLIC`, TOKENS.outsider)).statusCode,
    ).toBe(404);
    expect((await get(app, `${BASE}/memories?perspective=PUBLIC`)).statusCode).toBe(401);
  });
});

describe('sessions', () => {
  it('lists sessions for members only', async () => {
    const player = await get(app, `${BASE}/sessions`, TOKENS.player);
    expect(player.json<SessionListResponse>().sessions.map((s) => s.sessionId)).toEqual([
      'ravenford-s1',
    ]);
    expect((await get(app, `${BASE}/sessions`, TOKENS.outsider)).statusCode).toBe(404);
    expect((await get(app, '/campaigns/nope/sessions', TOKENS.dm)).statusCode).toBe(404);
    expect((await get(app, `${BASE}/sessions?perspective=DM`, TOKENS.player)).statusCode).toBe(400);
  });
});

describe('memory authoring over HTTP', () => {
  const post = (token: string, command: Record<string, unknown>, commandId: string) =>
    app.inject({
      method: 'POST',
      url: `${BASE}/commands`,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ commandId, command }),
    });
  const observation = {
    type: 'RecordMemory',
    scope: { kind: 'NPC', npcId: 'mira-vale' },
    memoryKind: 'OBSERVATION',
    summary: 'Mira saw the party arrive.',
    occurredAt: 32400,
    locationId: 'market-square',
    participants: ['mira-vale', 'elowen-starwhisper'],
  };

  it('accepts possible memories from the DM, rejects impossible ones and players', async () => {
    expect((await post(TOKENS.dm, observation, 'mem-ok')).json<CommandResult>().status).toBe(
      'accepted',
    );
    const distant = await post(
      TOKENS.dm,
      { ...observation, locationId: 'north-gate' },
      'mem-distant',
    );
    expect(distant.statusCode).toBe(422);
    expect(distant.json<CommandResult>()).toMatchObject({ code: 'IMPOSSIBLE_MEMORY' });
    expect((await post(TOKENS.player, observation, 'mem-player')).statusCode).toBe(403);
  });
});
