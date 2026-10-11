import { outputResponse, type ProviderRequest } from '@ltw/ai';
import type { NpcDialogueResponse } from '@ltw/contracts';
import { InMemoryEventStore, type CommandSubmission, type WorldEngine } from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';
import { describe, expect, it } from 'vitest';

import {
  TOKENS,
  post,
  ravenfordApp,
  recording,
  seededEngine,
  testAiGateway,
  testProvider,
} from '../testing/ravenford-app.ts';

/**
 * The NPC reply's accounting session (docs/STAGE_300_REMEDIATION_DESIGN.md §1; ADR 0032, B2): the
 * route captures it once from the authorized snapshot before the command runs. A session that
 * closes or changes while the command runs, or one that starts after a session-less snapshot,
 * never reaches the request: every attempt keeps the original ID or null, and no accounting
 * metadata enters a provider payload.
 */
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
let counter = 0;

async function asDm(engine: WorldEngine, command: Record<string, unknown>) {
  counter += 1;
  const result = await engine.execute({
    commandId: `npc-session-test.${String(counter)}`,
    campaignId: 'ravenford',
    actor: DM,
    command,
  });
  if (result.status === 'rejected') throw new Error(`setup rejected: ${result.code}`);
}
const sessionOf = async (engine: WorldEngine) =>
  (await engine.load('ravenford'))?.state.activeSessionId ?? null;

/** The engine, but every command is followed by the DM closing any session and starting another. */
function sessionChanging(engine: WorldEngine): WorldEngine {
  const execute = async (submission: CommandSubmission) => {
    const result = await engine.execute(submission);
    const open = await sessionOf(engine);
    if (open !== null) await asDm(engine, { type: 'EndSession', sessionId: open });
    await asDm(engine, { type: 'StartSession', title: 'Changed during the command' });
    return result;
  };
  return new Proxy(engine, {
    get(target, property, receiver) {
      if (property === 'execute') return execute;
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

function remote() {
  const requests: ProviderRequest[] = [];
  const provider = testProvider('remote', 'remote', (request, attempt) => {
    requests.push(request);
    attempt.onStart();
    return Promise.resolve(outputResponse({ reply: 'Mira nods.' }, 'remote-model'));
  });
  return { provider, requests };
}

async function ask(engine: WorldEngine) {
  const { provider, requests } = remote();
  const ai = testAiGateway(provider, recording());
  const app = await ravenfordApp(sessionChanging(engine), ai);
  try {
    const response = await post(
      app,
      '/campaigns/ravenford/npcs/mira-vale/dialogue',
      { characterId: 'elowen-starwhisper', intent: { kind: 'ask', topicId: 'old-trade-road' } },
      TOKENS.player,
    );
    expect(response.statusCode).toBe(200);
    const reply = response.json<NpcDialogueResponse>().reply;
    return { reply, requests, starts: ai.traces.starts(), traces: ai.traces.all() };
  } finally {
    await app.close();
  }
}

describe('the NPC reply’s accounting session', () => {
  it('keeps the session of the snapshot before the command, even when it closes and changes', async () => {
    const engine = await seededEngine(new InMemoryEventStore(), scriptedDice([15, 15]));
    const before = await sessionOf(engine);
    expect(before).not.toBeNull();
    const { reply, requests, starts } = await ask(engine);
    const after = await sessionOf(engine);
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
    expect(reply?.status).toBe('REPLIED');
    expect(starts.map((start) => start.sessionId)).toEqual([before]);
    expect(requests.map((request) => request.accounting.sessionId)).toEqual([before]);
    for (const request of requests) {
      const { capability, system, prompt, output, task } = request;
      const sent = JSON.stringify({ capability, system, prompt, output, task });
      for (const id of [before ?? '', after ?? '', request.accounting.requestId]) {
        expect(sent).not.toContain(id);
      }
    }
  });

  it('stays local only when the snapshot had no session, even if one starts during the command', async () => {
    const engine = await seededEngine(new InMemoryEventStore(), scriptedDice([15, 15]));
    await asDm(engine, { type: 'EndSession', sessionId: (await sessionOf(engine)) ?? '' });
    expect(await sessionOf(engine)).toBeNull();
    const { reply, requests, starts, traces } = await ask(engine);
    expect(await sessionOf(engine)).not.toBeNull();
    expect(starts.map((start) => start.sessionId)).toEqual([null]);
    expect(requests).toEqual([]);
    expect(reply?.status).toBe('REPLIED');
    expect(traces[0]?.attempts.map((a) => [a.provider, a.kind])).toEqual([['local', 'initial']]);
  });
});
