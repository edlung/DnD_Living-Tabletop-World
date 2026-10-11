import { ProviderError, type ProviderRequest, type ProviderResponse } from '@ltw/ai';
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
 * A raw adapter for OpenAI-compatible chat APIs (docs/adr/0032-live-ai.md, checkpoint B1), used
 * for DeepSeek. Structured output is a forced function call. The body is built from an allowlist:
 * the only provider switch is `thinking` (DeepSeek reasoning, billed and slow, off for these short
 * structured replies). `prepare` serializes the whole body; `dispatch` sends exactly it and
 * classifies the response like the Anthropic adapter (suspect, refusal, malformed, output).
 * DeepSeek caches automatically; no cache directive is sent. Errors carry a code and a fixed
 * message only: never the key, the request, or the body.
 */
export interface OpenAiCompatibleOptions {
  readonly id: string;
  readonly baseUrl: string;
  /** Read only by `dispatch`, before the start boundary; never logged. */
  readonly apiKey: () => string;
  readonly model: string;
  /** Returned model identifiers accepted for `model` (an explicit alias mapping); default: `model`. */
  readonly acceptedModels?: readonly string[];
  readonly timeoutMs: number;
  readonly maxTokens?: number;
  readonly thinking?: 'enabled' | 'disabled';
  readonly fetch?: typeof fetch;
}

export const OPENAI_COMPATIBLE_USAGE: UsageSpec = usageSpec({
  counts: [
    'prompt_tokens',
    'completion_tokens',
    'total_tokens',
    'prompt_cache_hit_tokens',
    'prompt_cache_miss_tokens',
  ],
  nested: {
    prompt_tokens_details: ['cached_tokens'],
    completion_tokens_details: ['reasoning_tokens'],
  },
  labels: {},
  input: 'prompt_tokens',
  output: 'completion_tokens',
});

const choicesSchema = z
  .array(
    z.looseObject({
      finish_reason: z.string().nullable().optional(),
      message: z
        .looseObject({
          refusal: z.string().nullable().optional(),
          tool_calls: z
            .array(
              z.looseObject({
                function: z.looseObject({ name: z.string(), arguments: z.string() }),
              }),
            )
            .nullable()
            .optional(),
        })
        .optional(),
    }),
  )
  .min(1);

function bodyOf(request: ProviderRequest, options: OpenAiCompatibleOptions): string {
  return JSON.stringify({
    model: options.model,
    max_tokens: options.maxTokens ?? 4_096,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.prompt },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: request.output.name,
          description: request.output.description,
          parameters: request.output.schema,
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: request.output.name } },
    ...(options.thinking ? { thinking: { type: options.thinking } } : {}),
  });
}

function classify(
  body: unknown,
  toolName: string,
  accepted: ReadonlySet<string>,
): ProviderResponse {
  const completion = responseObject(body);
  const facts = {
    model: safeIdentifier(completion['model']),
    ...usageFacts(completion['usage'], OPENAI_COMPATIBLE_USAGE),
    providerRequestId: safeIdentifier(completion['id']),
  };
  if (facts.model === null || !accepted.has(facts.model)) {
    return { kind: 'suspect', code: 'UNEXPECTED_MODEL', ...facts };
  }
  if (facts.billing && facts.billing.unrecognized.length > 0) {
    return { kind: 'suspect', code: 'UNVERIFIED_BILLING', ...facts };
  }
  const choices = choicesSchema.safeParse(completion['choices']);
  const choice = choices.success ? choices.data[0] : undefined;
  if (choice?.finish_reason === 'content_filter' || (choice?.message?.refusal ?? '') !== '') {
    return { kind: 'refusal', ...facts };
  }
  if (choice?.finish_reason === 'length') return { kind: 'malformed', code: 'TRUNCATED', ...facts };
  const call = choice?.message?.tool_calls?.find((c) => c.function.name === toolName);
  if (!call) return { kind: 'malformed', code: 'MISSING_TOOL', ...facts };
  let output: unknown;
  try {
    output = JSON.parse(call.function.arguments);
  } catch {
    return { kind: 'malformed', code: 'INVALID_JSON', ...facts };
  }
  return { kind: 'output', output, ...facts };
}

export function createOpenAiCompatibleProvider(
  options: OpenAiCompatibleOptions,
): RawRemoteProvider {
  const prepared = preparedRequests();
  const accepted = new Set(options.acceptedModels ?? [options.model]);
  return {
    id: options.id,
    model: options.model,
    prepare: (request) =>
      prepared.issue({
        provider: options.id,
        model: options.model,
        url: `${options.baseUrl}/chat/completions`,
        toolName: request.output.name,
        body: bodyOf(request, options),
      }),
    dispatch: async (request, signal, onStart) => {
      if (!prepared.owns(request)) {
        throw new ProviderError('TRANSPORT_NOT_STARTED', 'request was not prepared here');
      }
      const body = await sendPrepared({
        prepared: request,
        headers: () => ({
          'content-type': 'application/json',
          authorization: `Bearer ${options.apiKey()}`,
        }),
        signal,
        onStart,
        timeoutMs: options.timeoutMs,
        fetch: options.fetch,
      });
      return classify(body, request.toolName, accepted);
    },
  };
}
