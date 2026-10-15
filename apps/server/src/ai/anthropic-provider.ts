import { ProviderError, type ProviderPayload, type ProviderResponse } from '@ltw/ai';
import { z } from 'zod';

import {
  preparedRequests,
  responseObject,
  safeIdentifier,
  sendPrepared,
  type RawRemoteProvider,
} from './raw-provider.ts';
import { usageFacts, usageSpec, type UsageSpec } from './usage-facts.ts';

/**
 * The raw Anthropic Messages API adapter (docs/adr/0017-ai-gateway.md §2; docs/adr/0032-live-ai.md,
 * checkpoint B1): structured output as a tool call the model is told to make, over `fetch`.
 * Current Claude models reject a forced `tool_choice` with a 400 (checked live on 2026-10-05), so
 * the request uses `auto` and the system text names the tool. `prepare` serializes the whole body;
 * `dispatch` sends exactly it and classifies the response: an unaccepted model or unrecognized
 * usage is suspect (output discarded); a refusal is a refusal; truncation or a missing tool call is
 * malformed (invalid output, preserving usage). Errors carry a fixed code and message only: never
 * the key, the request, or the response body.
 *
 * Prompt caching (B2, design §3): with `cache: '5m'` the system text becomes one text block with
 * an ephemeral (5-minute) cache breakpoint. The cached prefix is the tool definition and that system
 * text only, both fixed per capability and language: no campaign, NPC, perspective or scoped data
 * comes before the breakpoint, and the text itself is unchanged. Cache writes and reads are billed
 * dimensions the catalog prices; a prefix below the model's cache minimum is simply uncached.
 */
export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 4_096;

export interface AnthropicOptions {
  /** Read only by `dispatch`, before the start boundary; never logged. */
  readonly apiKey: () => string;
  readonly model: string;
  /** Returned model identifiers accepted for `model` (an explicit alias mapping); default: `model`. */
  readonly acceptedModels?: readonly string[];
  readonly timeoutMs: number;
  /** `output_config.effort`; the model's default when absent. */
  readonly effort?: 'low' | 'medium' | 'high';
  readonly maxTokens?: number;
  /** A 5-minute cache breakpoint after the fixed system text; none when absent. */
  readonly cache?: '5m';
  readonly fetch?: typeof fetch;
}

/**
 * Every usage field the adapter can read (catalog verification of 2026-10-12, `reviews/
 * STAGE_300_CATALOG_VERIFICATION_CLAUDE_SONNET_5_5_2026-10-12.md`): the documented counts, the
 * thinking decomposition (part of `output_tokens`), the price-relevant labels at their only
 * standard value, server-tool counts only at zero (no server tool is ever requested), and the
 * undocumented fields seen on this machine, conservatively: `speed` only `standard`,
 * `fallback_credit` only null, `iterations` only as message entries adding up to the top-level
 * counts. Each catalog entry then accepts a subset (`pricing.ts`); anything else fails closed.
 */
export const ANTHROPIC_USAGE: UsageSpec = usageSpec({
  counts: [
    'input_tokens',
    'output_tokens',
    'cache_creation_input_tokens',
    'cache_read_input_tokens',
  ],
  nested: {
    cache_creation: ['ephemeral_5m_input_tokens', 'ephemeral_1h_input_tokens'],
    output_tokens_details: ['thinking_tokens'],
  },
  labels: {
    service_tier: ['standard'],
    inference_geo: ['global'],
    speed: ['standard'],
    fallback_credit: [],
  },
  zeroCounts: { server_tool_use: ['web_search_requests', 'web_fetch_requests'] },
  iterations: { field: 'iterations', type: 'message' },
  input: 'input_tokens',
  output: 'output_tokens',
});

const contentSchema = z.array(
  z.looseObject({ type: z.string(), name: z.string().optional(), input: z.unknown().optional() }),
);

function bodyOf(request: ProviderPayload, options: AnthropicOptions): string {
  const system = `${request.system}\nAnswer only by calling the ${request.output.name} tool.`;
  return JSON.stringify({
    model: options.model,
    max_tokens: options.maxTokens ?? MAX_TOKENS,
    ...(options.effort ? { output_config: { effort: options.effort } } : {}),
    system:
      options.cache === '5m'
        ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
        : system,
    messages: [{ role: 'user', content: request.prompt }],
    tools: [
      {
        name: request.output.name,
        description: request.output.description,
        input_schema: request.output.schema,
      },
    ],
    tool_choice: { type: 'auto' },
  });
}

function classify(
  body: unknown,
  toolName: string,
  accepted: ReadonlySet<string>,
): ProviderResponse {
  const message = responseObject(body);
  const facts = {
    model: safeIdentifier(message['model']),
    ...usageFacts(message['usage'], ANTHROPIC_USAGE),
    providerRequestId: safeIdentifier(message['id']),
  };
  if (facts.model === null || !accepted.has(facts.model)) {
    return { kind: 'suspect', code: 'UNEXPECTED_MODEL', ...facts };
  }
  if (facts.billing && facts.billing.unrecognized.length > 0) {
    return { kind: 'suspect', code: 'UNVERIFIED_BILLING', ...facts };
  }
  const stop = message['stop_reason'];
  if (stop === 'refusal') return { kind: 'refusal', ...facts };
  if (stop === 'max_tokens' || stop === 'model_context_window_exceeded') {
    return { kind: 'malformed', code: 'TRUNCATED', ...facts };
  }
  const content = contentSchema.safeParse(message['content']);
  const call = content.success
    ? content.data.find((block) => block.type === 'tool_use' && block.name === toolName)
    : undefined;
  if (call?.input === undefined) return { kind: 'malformed', code: 'MISSING_TOOL', ...facts };
  return { kind: 'output', output: call.input, ...facts };
}

export function createAnthropicProvider(options: AnthropicOptions): RawRemoteProvider {
  const prepared = preparedRequests();
  const accepted = new Set(options.acceptedModels ?? [options.model]);
  return {
    id: 'anthropic',
    model: options.model,
    prepare: (request) =>
      prepared.issue({
        provider: 'anthropic',
        model: options.model,
        url: ANTHROPIC_MESSAGES_URL,
        toolName: request.output.name,
        body: bodyOf(request, options),
      }),
    dispatch: async (request, signal, onStart, deadlineAtMs) => {
      if (!prepared.owns(request)) {
        throw new ProviderError('TRANSPORT_NOT_STARTED', 'request was not prepared here');
      }
      const body = await sendPrepared({
        prepared: request,
        headers: () => ({
          'content-type': 'application/json',
          'x-api-key': options.apiKey(),
          'anthropic-version': ANTHROPIC_VERSION,
        }),
        signal,
        onStart,
        timeoutMs: options.timeoutMs,
        deadlineAtMs,
        fetch: options.fetch,
      });
      return classify(body, request.toolName, accepted);
    },
  };
}
