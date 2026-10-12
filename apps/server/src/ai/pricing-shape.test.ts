import { describe, expect, it } from 'vitest';

import { FIXTURE_DEEPSEEK } from '../testing/catalog-fixtures.ts';
import { KEY, REQUEST } from '../testing/raw-adapter-fixtures.ts';
import { createAnthropicProvider } from './anthropic-provider.ts';
import { CLAUDE_SONNET_5_5 } from './catalog-sonnet-5-5.ts';
import { createDeepSeekProvider } from './openai-compatible-provider.ts';
import { reservationFor } from './pricing.ts';
import type { PreparedRequest } from './raw-provider.ts';

/**
 * The request allowlist below the top level (ADR 0032, checkpoint C repair 1): before admission a
 * body may carry only the one user message the adapter sends (no assistant turn or prefill), only
 * its one client tool (no server or typed tool), and no `cache_control` but the 5-minute ephemeral
 * breakpoint on the system text. Anything else could cost more than the reservation assumes.
 */
const anthropic = createAnthropicProvider({
  apiKey: () => KEY,
  model: 'claude-sonnet-5-5',
  timeoutMs: 1_000,
  effort: 'low',
  maxTokens: 4_096,
  cache: '5m',
});
const deepseek = createDeepSeekProvider({
  apiKey: () => KEY,
  model: 'deepseek-flash',
  timeoutMs: 1_000,
  thinking: 'disabled',
});

type Body = Record<string, unknown> & {
  messages: Record<string, unknown>[];
  tools: Record<string, unknown>[];
  system?: unknown;
};

/** The adapter's own prepared request with its body changed. */
function changed(prepared: PreparedRequest, change: (body: Body) => void): PreparedRequest {
  const body = JSON.parse(prepared.body) as Body;
  change(body);
  return { ...prepared, body: JSON.stringify(body) };
}

/** The first element, which these bodies always have. */
function first(list: Record<string, unknown>[]): Record<string, unknown> {
  const item = list[0];
  if (item === undefined) throw new Error('empty list');
  return item;
}

const SONNET = anthropic.prepare(REQUEST);
const FLASH = deepseek.prepare(REQUEST);
const systemBlock = (body: Body) => (body.system as Record<string, unknown>[])[0] ?? {};

describe('the Anthropic body below the top level', () => {
  it('accepts the adapter’s own body', () => {
    expect(reservationFor(CLAUDE_SONNET_5_5, SONNET)).toEqual({ ok: true, micros: 2_540_960n });
  });

  it.each([
    [
      'an assistant prefill',
      (body: Body) => body.messages.push({ role: 'assistant', content: '{"kind":' }),
    ],
    ['a second user turn', (body: Body) => body.messages.push({ role: 'user', content: 'more' })],
    ['no message', (body: Body) => body.messages.splice(0)],
    [
      'a message of content blocks',
      (body: Body) => {
        body.messages[0] = { role: 'user', content: [{ type: 'text', text: 'hi' }] };
      },
    ],
    [
      'a message field beyond role and content',
      (body: Body) => (first(body.messages)['name'] = 'x'),
    ],
  ])('refuses %s', (_label, change) => {
    expect(reservationFor(CLAUDE_SONNET_5_5, changed(SONNET, change))).toEqual({
      ok: false,
      reason: 'messages',
    });
  });

  it.each([
    [
      'a server tool',
      (body: Body) => body.tools.push({ type: 'web_search_20250305', name: 'web_search' }),
    ],
    ['a typed client tool', (body: Body) => (first(body.tools)['type'] = 'custom')],
    ['another tool name', (body: Body) => (first(body.tools)['name'] = 'other_tool')],
    [
      'a second client tool',
      (body: Body) => body.tools.push({ ...body.tools[0], name: 'propose_more' }),
    ],
    ['no tool', (body: Body) => body.tools.splice(0)],
  ])('refuses %s', (_label, change) => {
    expect(reservationFor(CLAUDE_SONNET_5_5, changed(SONNET, change))).toEqual({
      ok: false,
      reason: 'tools',
    });
  });

  it.each([
    [
      'a 1-hour breakpoint',
      (body: Body) => (systemBlock(body)['cache_control'] = { type: 'ephemeral', ttl: '1h' }),
    ],
    [
      'another breakpoint kind',
      (body: Body) => (systemBlock(body)['cache_control'] = { type: 'persistent' }),
    ],
    [
      'a breakpoint on the tool',
      (body: Body) => (first(body.tools)['cache_control'] = { type: 'ephemeral' }),
    ],
    [
      'a breakpoint inside the message',
      (body: Body) => {
        body.messages[0] = {
          role: 'user',
          content: [{ type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } }],
        };
      },
    ],
    [
      'a second system block',
      (body: Body) =>
        (body.system as unknown[]).push({
          type: 'text',
          text: 'more',
          cache_control: { type: 'ephemeral' },
        }),
    ],
  ])('refuses %s', (_label, change) => {
    const result = reservationFor(CLAUDE_SONNET_5_5, changed(SONNET, change));
    expect(result.ok).toBe(false);
  });

  it('refuses a top-level cache directive (not an allowlisted field)', () => {
    const top = changed(SONNET, (body) => (body['cache_control'] = { type: 'ephemeral' }));
    expect(reservationFor(CLAUDE_SONNET_5_5, top).ok).toBe(false);
    const allowing = {
      ...CLAUDE_SONNET_5_5,
      request: {
        ...CLAUDE_SONNET_5_5.request,
        fields: [...CLAUDE_SONNET_5_5.request.fields, 'cache_control'],
      },
    };
    // Even if a catalog allowed the field, the shape check refuses the directive.
    expect(reservationFor(allowing, top)).toEqual({ ok: false, reason: 'cache' });
  });

  it('refuses any breakpoint when the entry permits none', () => {
    expect(reservationFor({ ...CLAUDE_SONNET_5_5, cache: null }, SONNET)).toEqual({
      ok: false,
      reason: 'cache',
    });
  });
});

describe('the OpenAI-compatible body below the top level', () => {
  it('accepts the adapter’s own body', () => {
    expect(reservationFor(FIXTURE_DEEPSEEK, FLASH).ok).toBe(true);
  });

  it.each([
    [
      'an assistant prefill',
      (body: Body) => body.messages.push({ role: 'assistant', content: '{' }),
      'messages',
    ],
    [
      'a server tool',
      (body: Body) => body.tools.push({ type: 'web_search', name: 'web_search' }),
      'tools',
    ],
    [
      'a cache directive',
      (body: Body) => (first(body.messages)['cache_control'] = { type: 'ephemeral' }),
      'messages',
    ],
  ])('refuses %s', (_label, change, reason) => {
    expect(reservationFor(FIXTURE_DEEPSEEK, changed(FLASH, change))).toEqual({
      ok: false,
      reason,
    });
  });
});
