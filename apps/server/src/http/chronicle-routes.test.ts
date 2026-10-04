import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import dayTwo from '../../../../fixtures/ravenford/day-two.json' with { type: 'json' };
import type {
  ChronicleListResponse,
  CommandResult,
  FlashbackResponse,
  GenerateChronicleResponse,
  MemorySuggestionsResponse,
} from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  FORBIDDEN_MARKERS,
  NPC_BOUNDARY,
  TOKENS,
  get,
  plantNpcBoundary,
  post,
  ravenfordApp,
  seededEngine,
  withoutRequestId,
} from '../testing/ravenford-app.ts';

/**
 * Ravenford's Chapter I over HTTP (RAVENFORD_SPEC.md, Chronicle; ADR 0024):
 * the party meets Mira, rides out, fights on the Old Trade Road, returns,
 * and Day 2 dawns. The DM records the memories the system suggests, then
 * generates the chapter for the party. Every claim traces to source events;
 * the chapter holds nothing the party may not know.
 */
const BASE = '/campaigns/ravenford';
let engine: WorldEngine;
let app: FastifyInstance;
let counter = 0;

const command = async (token: string, body: Record<string, unknown>) => {
  counter += 1;
  const response = await post(
    app,
    `${BASE}/commands`,
    { commandId: `chronicle-route.${String(counter)}`, command: body },
    token,
  );
  return { status: response.statusCode, body: response.json<CommandResult>() };
};
const dm = async (body: Record<string, unknown>) => {
  const { body: result } = await command(TOKENS.dm, body);
  if (result.status === 'rejected') throw new Error(`${String(body['type'])}: ${result.code}`);
  return result;
};

beforeEach(async () => {
  engine = await seededEngine();
  await plantNpcBoundary(engine);
  app = await ravenfordApp(engine);
  // The road: the ambush, then the fight ends and Elowen rides home; Day 2 dawns in rain.
  for (const place of ambush.place) await dm(place);
  await dm(ambush.startCombat);
  const encounterId = (await engine.load('ravenford'))?.state.encounter?.encounterId;
  await dm({ type: 'EndCombat', encounterId });
  await dm({ type: 'AdvanceWorldTime', by: 7_200 });
  await dm({ type: 'PlaceEntity', entityId: 'elowen-starwhisper', locationId: 'market-square' });
  for (const step of dayTwo.commands) await dm(step);
});

async function rememberSuggested() {
  const response = await get(app, `${BASE}/chronicle/suggestions?from=0`, TOKENS.dm);
  expect(response.statusCode).toBe(200);
  const { suggestions } = response.json<MemorySuggestionsResponse>();
  for (const suggestion of suggestions) await dm({ ...suggestion.command });
  return suggestions;
}

const generate = (token: string = TOKENS.dm, body: Record<string, unknown> = {}) =>
  post(
    app,
    `${BASE}/chronicle`,
    { title: 'Chapter I — Shadows on the Trade Road', perspective: 'PARTY', from: 0, ...body },
    token,
  );

describe('Chapter I — Shadows on the Trade Road', () => {
  it('suggests the battle, the road, the return, and Day 2, and tells them all with their sources', async () => {
    const suggested = await rememberSuggested();
    expect(suggested.map((s) => s.reason)).toEqual(['arrival', 'battle', 'arrival', 'new-day']);
    expect(suggested.map((s) => s.command['summary'])).toEqual([
      'We arrived at Old Trade Road.',
      'We fought 4 foes at Old Trade Road.',
      'We returned to Ravenford.',
      'Day 2 dawned.',
    ]);

    const generated = await generate();
    expect(generated.statusCode).toBe(200);
    const body = generated.json<GenerateChronicleResponse>();
    expect(body).toMatchObject({
      result: { status: 'accepted' },
      rendering: { status: 'RENDERED', provider: 'local' },
    });

    const read = await get(app, `${BASE}/chronicle?perspective=PARTY`, TOKENS.player);
    expect(read.statusCode).toBe(200);
    const [chapter] = read.json<ChronicleListResponse>().chapters;
    expect(chapter?.entries.map((entry) => entry.text)).toEqual([
      'Mira told us the caravan left before dawn.',
      'We decided to search the Old Trade Road for the caravan.',
      'Because of that decision, we bought supplies for the road.',
      'We arrived at Old Trade Road.',
      'We fought 4 foes at Old Trade Road.',
      'We returned to Ravenford.',
      'Day 2 dawned.',
    ]);
    // Every claim traces to effective events of this campaign.
    const history = (await engine.load('ravenford'))?.history ?? [];
    const recorded = new Set(history.map((event) => event.eventId));
    for (const entry of chapter?.entries ?? []) {
      expect(entry.sources.length).toBeGreaterThan(0);
      for (const source of entry.sources) {
        expect(recorded.has(source.eventId)).toBe(true);
        expect(source.sequence).toBeUndefined();
      }
    }
    const keys = new Set(chapter?.entries.map((entry) => entry.key));
    for (const paragraph of chapter?.prose.paragraphs ?? []) {
      expect(paragraph.cites.every((key) => keys.has(key))).toBe(true);
    }
    expect(chapter?.prose.traceId).toBeNull();
    const planted = NPC_BOUNDARY.neverSaid['*'].filter(
      (marker) => marker.startsWith('NBX') && marker !== 'NBXPARTY',
    );
    for (const marker of [...(FORBIDDEN_MARKERS['PARTY'] ?? []), ...planted]) {
      expect(read.body).not.toContain(marker);
    }

    // The rendering is traced for the DM alone.
    const trace = `${BASE}/ai/traces/${body.rendering.traceId ?? ''}`;
    expect((await get(app, trace, TOKENS.dm)).statusCode).toBe(200);
    expect((await get(app, trace, TOKENS.player)).statusCode).toBe(403);
  });

  it('opens Mira’s account as a flashback, and nothing the party may not recall', async () => {
    const flashback = await get(
      app,
      `${BASE}/memories/mem-party-talk-mira/flashback?perspective=PARTY`,
      TOKENS.player,
    );
    expect(flashback.statusCode).toBe(200);
    expect(flashback.json<FlashbackResponse>()).toMatchObject({
      worldTime: 34_200,
      scene: { entityId: 'market-square', observed: true },
      dialogue: { knowledgeType: 'TESTIMONY', speaker: { name: 'Mira Vale' } },
    });
    const missing = await get(
      app,
      `${BASE}/memories/no-memory/flashback?perspective=PARTY`,
      TOKENS.player,
    );
    const hidden = await get(
      app,
      `${BASE}/memories/mem-mira-departure/flashback?perspective=PARTY`,
      TOKENS.player,
    );
    expect(withoutRequestId(hidden)).toEqual(withoutRequestId(missing));
  });

  it('is the DM’s to generate, only through this route', async () => {
    expect((await generate(TOKENS.player)).statusCode).toBe(403);
    expect((await generate(TOKENS.outsider)).statusCode).toBe(404);
    expect((await generate(TOKENS.dm, { perspective: 'PLAYER' })).statusCode).toBe(400);
    expect((await generate(TOKENS.dm, { from: 10_000_000 })).statusCode).toBe(400);
    expect((await generate(TOKENS.dm, { from: -900, to: -800 })).statusCode).toBe(422);
    expect((await get(app, `${BASE}/chronicle/suggestions?from=0`, TOKENS.player)).statusCode).toBe(
      403,
    );
    const direct = await command(TOKENS.dm, {
      type: 'GenerateChronicle',
      title: 'Forged',
      perspective: 'PARTY',
      from: 0,
      to: 0,
      prose: {
        paragraphs: [{ text: 'x', cites: ['e1'] }],
        provider: 'x',
        model: 'x',
        traceId: null,
      },
    });
    expect(direct.status).toBe(400);
    // A player reads only chapters told from a perspective they hold.
    await generate(TOKENS.dm, { perspective: 'DM' });
    const party = await get(app, `${BASE}/chronicle?perspective=PARTY`, TOKENS.player);
    expect(party.json<ChronicleListResponse>().chapters).toEqual([]);
    expect((await get(app, `${BASE}/chronicle?perspective=DM`, TOKENS.player)).statusCode).toBe(
      403,
    );
  });
});
