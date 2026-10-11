import { dialogueRequest, intentRequest, type DialoguePrompt, type ProviderPayload } from '@ltw/ai';
import { describe, expect, it } from 'vitest';

import { fakeFetch, jsonResponse } from '../testing/fake-fetch.ts';
import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  createAnthropicProvider,
} from './anthropic-provider.ts';

/**
 * The Anthropic adapter's wire format against a fake `fetch`; the shared raw adapter contract is
 * `raw-adapters.test.ts`. Tests never reach the network.
 */
const KEY = 'sk-ant-test-key-never-shown';
const REQUEST: ProviderPayload = intentRequest(
  'Advance time by 1 hour.',
  {
    scope: 'PUBLIC',
    items: [{ sourceId: 'north-gate', kind: 'entity', text: 'north-gate (location): North Gate' }],
    entities: [{ entityId: 'north-gate', kind: 'location', name: 'North Gate' }],
    worldTime: 0,
  },
  null,
);

describe('createAnthropicProvider', () => {
  it('prepares an unforced tool call that names the tool in the system text', () => {
    const anthropic = createAnthropicProvider({
      apiKey: () => KEY,
      model: 'claude-opus-5-5',
      timeoutMs: 1_000,
      effort: 'low',
      fetch: fakeFetch(() => jsonResponse({})).fetchImpl,
    });
    const prepared = anthropic.prepare(REQUEST);

    expect(prepared.url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(JSON.parse(prepared.body)).toEqual({
      model: 'claude-opus-5-5',
      max_tokens: 4_096,
      output_config: { effort: 'low' },
      system: `${REQUEST.system}\nAnswer only by calling the propose_commands tool.`,
      messages: [{ role: 'user', content: REQUEST.prompt }],
      tools: [
        {
          name: 'propose_commands',
          description: REQUEST.output.description,
          input_schema: REQUEST.output.schema,
        },
      ],
      tool_choice: { type: 'auto' },
    });
  });

  it('sends the key and API version only as headers', async () => {
    const fake = fakeFetch(() => jsonResponse({}));
    const anthropic = createAnthropicProvider({
      apiKey: () => KEY,
      model: 'claude-opus-5-5',
      timeoutMs: 1_000,
      fetch: fake.fetchImpl,
    });
    await anthropic
      .dispatch(anthropic.prepare(REQUEST), new AbortController().signal, () => undefined)
      .catch(() => undefined);

    expect(fake.calls[0]?.init).toMatchObject({
      method: 'POST',
      headers: {
        'x-api-key': KEY,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
    });
    expect(fake.calls[0]?.body).not.toContain(KEY);
  });
});

/** Two NPC prompts that differ in every scoped field: identity, perspective, place, knowledge. */
const npcPrompt = (npc: string, speaker: string, place: string, fact: string): DialoguePrompt => ({
  npc,
  speaker,
  attitude: 'NEUTRAL',
  time: 'Day 1 10:00:00',
  place,
  around: [place],
  intent: 'talk',
  accepted: true,
  topic: null,
  justTold: [],
  mayTell: [fact],
  common: [],
  memories: [fact],
  shown: [],
  guarded: [],
  line: 'Hello.',
});

describe('prompt caching (B2, design §3)', () => {
  const cached = createAnthropicProvider({
    apiKey: () => KEY,
    model: 'claude-sonnet-5-5',
    timeoutMs: 1_000,
    cache: '5m',
    fetch: fakeFetch(() => jsonResponse({})).fetchImpl,
  });
  const plain = createAnthropicProvider({
    apiKey: () => KEY,
    model: 'claude-sonnet-5-5',
    timeoutMs: 1_000,
    fetch: fakeFetch(() => jsonResponse({})).fetchImpl,
  });
  const bodyOf = (request: ProviderPayload, adapter = cached) =>
    JSON.parse(adapter.prepare(request).body) as Record<string, unknown>;
  /** What precedes the breakpoint: tool definitions, then system text (Anthropic's order). */
  const prefixOf = (request: ProviderPayload) => {
    const body = bodyOf(request);
    return JSON.stringify([body['tools'], body['system']]);
  };

  it('marks one 5-minute breakpoint after the unchanged system text, and nothing else', () => {
    const body = bodyOf(REQUEST);
    const uncached = bodyOf(REQUEST, plain);
    expect(body['system']).toEqual([
      { type: 'text', text: uncached['system'], cache_control: { type: 'ephemeral' } },
    ]);
    const withoutSystem = (value: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'system'));
    expect(withoutSystem(body)).toEqual(withoutSystem(uncached));
    expect(JSON.stringify(body['messages'])).not.toContain('cache_control');
  });

  it('caches a prefix byte-identical across NPCs, speakers and campaigns, holding no scoped data', () => {
    const mira = dialogueRequest(
      npcPrompt('Mira Vale', 'Elowen', 'Market Square', 'NBXMIRA'),
      null,
    );
    const orin = dialogueRequest(
      npcPrompt('Orin Stonebeard', 'Thorn', "Orin's Alchemy", 'NBXORIN'),
      null,
    );
    expect(prefixOf(mira)).toBe(prefixOf(orin));
    for (const scoped of [
      'Mira Vale',
      'Orin',
      'Elowen',
      'Thorn',
      'Market Square',
      'NBXMIRA',
      'NBXORIN',
    ]) {
      expect(prefixOf(mira)).not.toContain(scoped);
      expect(prefixOf(orin)).not.toContain(scoped);
    }
    const other = intentRequest(
      'Advance time by 2 hours.',
      {
        scope: 'PUBLIC',
        items: [{ sourceId: 'harbor', kind: 'entity', text: 'harbor (location): Harbor' }],
        entities: [{ entityId: 'harbor', kind: 'location', name: 'Harbor' }],
        worldTime: 99,
      },
      null,
    );
    expect(prefixOf(other)).toBe(prefixOf(REQUEST));
    for (const scoped of ['north-gate', 'North Gate', 'harbor', 'Harbor']) {
      expect(prefixOf(REQUEST)).not.toContain(scoped);
    }
  });
});
