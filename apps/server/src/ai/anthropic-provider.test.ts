import { intentRequest, type ProviderRequest } from '@ltw/ai';
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
const REQUEST: ProviderRequest = intentRequest(
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
