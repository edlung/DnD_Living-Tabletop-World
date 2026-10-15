import type { AiTraceStore } from '@ltw/ai';
import type {
  DmIntentResponse,
  EntityContextResponse,
  GenerateChronicleResponse,
  NpcDialogueResponse,
} from '@ltw/contracts';
import { InMemoryEventStore } from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';
import { describe, expect, it } from 'vitest';

import {
  TOKENS,
  get,
  post,
  ravenfordApp,
  recording,
  seededEngine,
  testAiGateway,
} from '../testing/ravenford-app.ts';

/**
 * Every AI route when the request journal cannot confirm a durable start (docs/adr/0032-live-ai.md,
 * B2; design §2 "No durable request-start"): exact nullable-ID answers, no provider at all (not
 * even local), bounded completion, the canonical NPC command and the validated Chronicle command
 * unaffected, and nothing to author from.
 */
const failing = (mode: 'fail' | 'stall'): AiTraceStore => ({
  start: () => (mode === 'fail' ? Promise.resolve(false) : new Promise<boolean>(() => undefined)),
  finalize: () => Promise.reject(new Error('never started')),
  get: () => Promise.resolve(null),
});

describe.each(['fail', 'stall'] as const)('every AI route when the request start %ss', (mode) => {
  it('answers without a trace ID, invokes no provider, and keeps canonical results', async () => {
    const engine = await seededEngine(new InMemoryEventStore(), scriptedDice([15, 15]));
    const local = recording();
    const ai = {
      ...testAiGateway(local),
      traces: failing(mode),
      requestTimeoutMs: 300,
      relevanceBudgetMs: 300,
    };
    const app = await ravenfordApp(engine, ai);
    try {
      const began = performance.now();
      const intent = (
        await post(
          app,
          '/campaigns/ravenford/ai/intents',
          { text: 'Advance time by 1 hour.' },
          TOKENS.dm,
        )
      ).json<DmIntentResponse>();
      expect(intent).toEqual({
        traceId: null,
        status: 'AI_UNAVAILABLE',
        proposal: null,
        issues: [],
        committable: false,
      });
      expect(
        (
          await post(
            app,
            '/campaigns/ravenford/authoring/proposals',
            { traceId: intent.traceId },
            TOKENS.dm,
          )
        ).statusCode,
      ).toBe(400);

      const version = (await engine.load('ravenford'))?.state.version ?? 0;
      const npc = (
        await post(
          app,
          '/campaigns/ravenford/npcs/mira-vale/dialogue',
          { characterId: 'elowen-starwhisper', intent: { kind: 'ask', topicId: 'old-trade-road' } },
          TOKENS.player,
        )
      ).json<NpcDialogueResponse>();
      expect(npc.reply).toEqual({
        traceId: null,
        status: 'AI_UNAVAILABLE',
        text: null,
        canonical: false,
      });
      // The canonical command ran once and stands.
      expect(npc.command).not.toBeNull();
      expect((await engine.load('ravenford'))?.state.version).toBeGreaterThan(version);

      const ranked = (
        await get(
          app,
          '/campaigns/ravenford/entities/mira-vale/context?perspective=PLAYER&ranking=ai',
          TOKENS.player,
        )
      ).json<EntityContextResponse>();
      expect(ranked.ranking).toEqual({
        source: 'deterministic',
        status: mode === 'stall' ? 'TIMEOUT' : 'AI_UNAVAILABLE',
        traceId: null,
      });

      const chapter = (
        await post(
          app,
          '/campaigns/ravenford/chronicle',
          { title: 'Chapter I', perspective: 'PARTY', from: 0 },
          TOKENS.dm,
        )
      ).json<GenerateChronicleResponse>();
      expect(chapter.chronicleId).not.toBeNull();
      expect(chapter.rendering).toEqual({
        status: 'AI_UNAVAILABLE',
        provider: 'template',
        traceId: null,
      });
      const listed = (
        await get(app, '/campaigns/ravenford/chronicle?perspective=DM', TOKENS.dm)
      ).json<{
        chapters: { prose: { provider: string; model: string; traceId: string | null } }[];
      }>();
      expect(listed.chapters.at(-1)?.prose).toMatchObject({
        provider: 'template',
        model: 'chronicle-template-1',
        traceId: null,
      });

      expect(local.requests).toEqual([]);
      expect(performance.now() - began).toBeLessThan(5_000);
    } finally {
      await app.close();
    }
  });
});
