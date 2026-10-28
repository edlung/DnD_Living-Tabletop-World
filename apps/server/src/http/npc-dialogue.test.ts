import type { AiTraceView, NpcDialogueResponse } from '@ltw/contracts';
import { InMemoryEventStore, type WorldEngine } from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import { createLogger } from '../platform/logging/logger.ts';
import { loadDevPersonaAuthenticator } from './auth.ts';
import { DEFAULT_PERSONAS_FILE } from '../platform/config/config.ts';
import {
  TOKENS,
  get,
  post,
  ravenfordApp,
  seededEngine,
  testAiGateway,
  RAVENFORD_QUESTS,
  testAssets,
  testAuthoring,
  testDm,
  withoutRequestId,
} from '../testing/ravenford-app.ts';
import { buildApp } from './app.ts';

/**
 * NPC dialogue over HTTP (ADR 0020 §1, §3): the ADR 0009 check order, the
 * intent's command first and as the caller may see it, then a traced reply
 * that changes nothing.
 */
const ELOWEN = 'elowen-starwhisper';
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const dialogue = (npcId: string) => `/campaigns/ravenford/npcs/${npcId}/dialogue`;

let engine: WorldEngine;
let ai: ReturnType<typeof testAiGateway>;
let app: FastifyInstance;
let counter = 0;
beforeEach(async () => {
  engine = await seededEngine(new InMemoryEventStore(), scriptedDice([15, 15]));
  ai = testAiGateway();
  app = await ravenfordApp(engine, ai);
});

async function asDm(command: Record<string, unknown>) {
  counter += 1;
  const result = await engine.execute({
    commandId: `npc-dialogue-test.${String(counter)}`,
    campaignId: 'ravenford',
    actor: DM,
    command,
  });
  if (result.status === 'rejected') throw new Error(`setup rejected: ${result.code}`);
}

const say = (
  npcId: string,
  intent: Record<string, unknown>,
  token: string = TOKENS.player,
  line?: string,
) => post(app, dialogue(npcId), { characterId: ELOWEN, intent, ...(line ? { line } : {}) }, token);
const version = async () => (await engine.load('ravenford'))?.state.version;

describe('talking with an NPC', () => {
  it('replies to Talk with no command and no change', async () => {
    const before = await version();
    const response = await say('mira-vale', { kind: 'talk' }, TOKENS.player, 'Good morning!');

    expect(response.statusCode).toBe(200);
    expect(response.json<NpcDialogueResponse>()).toEqual({
      command: null,
      refused: null,
      reply: {
        traceId: expect.any(String) as string,
        status: 'REPLIED',
        text: 'Mira Vale looks up. “Can I help you?”',
        canonical: false,
      },
    });
    expect(await version()).toBe(before);
  });

  it('runs the intent’s command first, shown as a player sees it, then voices it', async () => {
    const response = await say('mira-vale', { kind: 'ask', topicId: 'old-trade-road' });
    const body = response.json<NpcDialogueResponse>();

    expect(response.statusCode).toBe(200);
    expect(body.command).toMatchObject({ status: 'accepted', events: [] });
    expect(body.command?.status === 'accepted' ? body.command.outcome : null).toMatchObject({
      kind: 'AskAbout',
      shared: [expect.any(String), expect.any(String)],
    });
    expect(body.reply?.text).toContain(
      'A similar caravan vanished on the Old Trade Road last spring.',
    );
  });

  it('plays the Orin scene: shown the symbol, he tells the prior incident', async () => {
    await asDm({
      type: 'AddKnowledge',
      knowledgeId: 'party-symbol-evidence',
      scope: { kind: 'PARTY' },
      knowledgeType: 'EVIDENCE',
      statement: 'A strange symbol is burned into a wagon plank.',
      subjects: ['feature-19c7c7f7'],
      knownSince: null,
    });
    await asDm({ type: 'EnterLocation', characterId: ELOWEN, locationId: 'orins-alchemy' });

    const first = (
      await say('orin-stonebeard', { kind: 'ask', topicId: 'feature-19c7c7f7' })
    ).json<NpcDialogueResponse>();
    expect(first.command).toMatchObject({ status: 'rejected', code: 'NO_EFFECT' });
    expect(first.reply?.text).toBe(
      'Orin Stonebeard looks up. “Strange Symbol is not something I will discuss.”',
    );

    const shown = await say('orin-stonebeard', {
      kind: 'show',
      knowledgeId: 'party-symbol-evidence',
    });
    expect(shown.json<NpcDialogueResponse>().command).toMatchObject({
      status: 'accepted',
      outcome: { kind: 'ShowEvidence', shown: 'party-symbol-evidence' },
    });
    const told = (
      await say('orin-stonebeard', { kind: 'ask', topicId: 'feature-19c7c7f7' })
    ).json<NpcDialogueResponse>();
    expect(told.reply?.text).toContain(
      'Orin recognized the same symbol after a caravan vanished last spring.',
    );
    expect(JSON.stringify(told)).not.toContain('reagent');
  });

  it('remembers what it told: no fresh greeting, and asked again it repeats, never denies (SI-N1)', async () => {
    const greeting = (await say('mira-vale', { kind: 'talk' })).json<NpcDialogueResponse>();
    expect(greeting.reply?.text).toBe('Mira Vale looks up. “Can I help you?”');

    const asked = (
      await say('mira-vale', { kind: 'ask', topicId: 'old-trade-road' })
    ).json<NpcDialogueResponse>();
    expect(asked.command).toMatchObject({ status: 'accepted' });

    const again = (await say('mira-vale', { kind: 'talk' })).json<NpcDialogueResponse>();
    expect(again.reply?.text).toBe('Mira Vale looks up. “Back again. What else can I do for you?”');

    const repeated = (
      await say('mira-vale', { kind: 'ask', topicId: 'old-trade-road' })
    ).json<NpcDialogueResponse>();
    expect(repeated.command).toMatchObject({ status: 'rejected', code: 'NO_EFFECT' });
    expect(repeated.reply?.text).toContain('As I told you:');
    expect(repeated.reply?.text).toContain(
      'A similar caravan vanished on the Old Trade Road last spring.',
    );
  });

  it('a companion who never met her gets no "Back again" (SI-N1, per character)', async () => {
    await asDm({
      type: 'CreateEntity',
      entityId: 'bran-ironfoot',
      kind: 'character',
      name: 'Bran Ironfoot',
      existsSince: null,
      placement: { locationId: 'market-square', since: null },
    });
    await asDm({
      type: 'AssignCharacter',
      characterId: 'bran-ironfoot',
      playerActorId: 'player-bran',
    });
    await say('mira-vale', { kind: 'ask', topicId: 'old-trade-road' });
    const elowen = (await say('mira-vale', { kind: 'talk' })).json<NpcDialogueResponse>();
    expect(elowen.reply?.text).toContain('Back again.');

    const bran = (
      await post(
        app,
        dialogue('mira-vale'),
        {
          characterId: 'bran-ironfoot',
          intent: { kind: 'talk' },
        },
        TOKENS.dm,
      )
    ).json<NpcDialogueResponse>();
    expect(bran.reply?.text).toBe('Mira Vale looks up. “Can I help you?”');
  });

  it('reads an NPC once with Insight, and keeps talking after', async () => {
    const first = (
      await say('mira-vale', { kind: 'insight', topicId: 'guild-caravan' })
    ).json<NpcDialogueResponse>();
    expect(first.command?.status === 'accepted' ? first.command.outcome : null).toMatchObject({
      kind: 'InsightCheck',
      roll: { d20: 15 },
      inferred: [expect.any(String)],
    });
    const again = await say('mira-vale', { kind: 'insight', topicId: 'guild-caravan' });
    expect(again.statusCode).toBe(200);
    expect(again.json<NpcDialogueResponse>()).toMatchObject({
      command: { status: 'rejected', code: 'ALREADY_ATTEMPTED' },
      reply: { status: 'REPLIED' },
    });
  });
});

describe('who may talk, and when', () => {
  it('follows the ADR 0009 order: 401, 400, 404, 403', async () => {
    expect(
      (await post(app, dialogue('mira-vale'), { characterId: ELOWEN, intent: { kind: 'talk' } }))
        .statusCode,
    ).toBe(401);
    expect((await say('mira-vale', { kind: 'sing' })).statusCode).toBe(400);
    expect(
      (await say('mira-vale', { kind: 'talk' }, TOKENS.player, 'x'.repeat(501))).statusCode,
    ).toBe(400);
    expect((await say('mira-vale', { kind: 'talk' }, TOKENS.outsider)).statusCode).toBe(404);
    expect(
      (
        await post(
          app,
          '/campaigns/elsewhere/npcs/mira-vale/dialogue',
          { characterId: ELOWEN, intent: { kind: 'talk' } },
          TOKENS.player,
        )
      ).statusCode,
    ).toBe(404);
    await asDm({
      type: 'CreateEntity',
      entityId: 'bram-tull',
      kind: 'character',
      name: 'Bram Tull',
      existsSince: null,
      placement: { locationId: 'market-square', since: null },
    });
    const other = await post(
      app,
      dialogue('mira-vale'),
      { characterId: 'bram-tull', intent: { kind: 'talk' } },
      TOKENS.player,
    );
    expect(other.statusCode).toBe(403);
    expect((await say('mira-vale', { kind: 'talk' }, TOKENS.dm)).statusCode).toBe(200);
    expect(ai.traces.all()).toHaveLength(1);
  });

  it('refuses before any command or provider call when the NPC cannot hear', async () => {
    const before = await version();
    const absent = await say('orin-stonebeard', { kind: 'ask', topicId: 'feature-19c7c7f7' });
    expect(absent.statusCode).toBe(422);
    expect(absent.json()).toEqual({ command: null, refused: 'NOT_PRESENT', reply: null });

    const unknown = await say('no-such-npc', { kind: 'talk' });
    expect(withoutRequestId(unknown)).toEqual({
      status: 422,
      command: null,
      refused: 'ENTITY_NOT_FOUND',
      reply: null,
    });
    expect(ai.traces.all()).toHaveLength(0);
    expect(await version()).toBe(before);
  });
});

describe('traces', () => {
  it('are DM data, and a reply never becomes an authoring proposal', async () => {
    const { reply } = (
      await say('mira-vale', { kind: 'talk' }, TOKENS.player, 'Hello there.')
    ).json<NpcDialogueResponse>();
    const traceId = reply?.traceId ?? '';
    const url = `/campaigns/ravenford/ai/traces/${traceId}`;

    expect((await get(app, url, TOKENS.player)).statusCode).toBe(403);
    const trace = (await get(app, url, TOKENS.dm)).json<AiTraceView>();
    expect(trace).toMatchObject({
      purpose: 'npc-dialogue',
      scope: 'NPC:mira-vale',
      input: 'Hello there.',
      intent: { kind: 'talk' },
      commandId: null,
      canonicalEvents: [],
    });
    const proposal = await post(
      app,
      '/campaigns/ravenford/authoring/proposals',
      { traceId },
      TOKENS.dm,
    );
    expect(proposal.statusCode).toBe(422);
  });

  it('logs statuses and the trace ID, never the player’s words or the reply', async () => {
    const lines: Record<string, unknown>[] = [];
    const logged = buildApp({
      engine,
      ai,
      authoring: testAuthoring(),
      dm: testDm(),
      assets: testAssets(),
      quests: RAVENFORD_QUESTS,
      authenticator: await loadDevPersonaAuthenticator(DEFAULT_PERSONAS_FILE),
      logger: createLogger({
        service: 'npc-test',
        level: 'info',
        destination: {
          write: (chunk: string) => lines.push(JSON.parse(chunk) as Record<string, unknown>),
        },
      }),
    });
    await logged.ready();
    const response = await logged.inject({
      method: 'POST',
      url: dialogue('mira-vale'),
      payload: { characterId: ELOWEN, intent: { kind: 'talk' }, line: 'WHISPERED-WORDS-417' },
      headers: { authorization: `Bearer ${TOKENS.player}` },
    });
    const { reply } = response.json<NpcDialogueResponse>();
    const text = JSON.stringify(lines);
    expect(lines.find((line) => line['msg'] === 'npc dialogue')).toMatchObject({
      intent: 'talk',
      traceId: reply?.traceId,
      replyStatus: 'REPLIED',
    });
    expect(text).not.toContain('WHISPERED-WORDS-417');
    expect(text).not.toContain(reply?.text ?? 'unreachable');
  });
});
