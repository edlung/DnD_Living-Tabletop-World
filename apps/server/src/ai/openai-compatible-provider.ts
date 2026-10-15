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
 * A raw adapter for OpenAI-compatible chat APIs (docs/adr/0032-live-ai.md, checkpoints B1 and B2),
 * used for DeepSeek. Structured output is a forced function call. The body is built from an
 * allowlist: the only provider switch is `thinking` (DeepSeek reasoning, billed and slow, off for
 * these short structured replies). `prepare` serializes the whole body; `dispatch` sends exactly it
 * and classifies the response like the Anthropic adapter (suspect, refusal, malformed, output).
 * Provider identity (`deepseek`) and its endpoint are fixed here in trusted code, never configured,
 * so a relabelled provider cannot bypass a stop (B2 stop-scope delta). Exactly one choice is
 * accepted: more is an unrequested billing option (unverified billing). A refusal is any non-empty
 * refusal value; a length or `insufficient_system_resource` stop is truncation. DeepSeek caches
 * automatically; no cache directive is sent. Unused at runtime (owner decision 3, 2026-10-11).
 * Errors carry a code and a fixed message only: never the key, the request, or the body.
 */
export const DEEPSEEK_PROVIDER = 'deepseek';
export const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/chat/completions';

export interface DeepSeekOptions {
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
          refusal: z.unknown().optional(),
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

/** Finish reasons after which a tool call is complete; any other is truncation. */
const COMPLETE = new Set<string | null | undefined>(['tool_calls', 'stop', null, undefined]);

function bodyOf(request: ProviderPayload, options: DeepSeekOptions): string {
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
  if (choices.success && choices.data.length > 1) {
    return { kind: 'suspect', code: 'UNVERIFIED_BILLING', ...facts };
  }
  const choice = choices.success ? choices.data[0] : undefined;
  const refusal = choice?.message?.refusal;
  if (
    choice?.finish_reason === 'content_filter' ||
    (refusal !== undefined && refusal !== null && refusal !== '')
  ) {
    return { kind: 'refusal', ...facts };
  }
  if (choice !== undefined && !COMPLETE.has(choice.finish_reason)) {
    return { kind: 'malformed', code: 'TRUNCATED', ...facts };
  }
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

export function createDeepSeekProvider(options: DeepSeekOptions): RawRemoteProvider {
  const prepared = preparedRequests();
  const accepted = new Set(options.acceptedModels ?? [options.model]);
  return {
    id: DEEPSEEK_PROVIDER,
    model: options.model,
    prepare: (request) =>
      prepared.issue({
        provider: DEEPSEEK_PROVIDER,
        model: options.model,
        url: DEEPSEEK_CHAT_URL,
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
          authorization: `Bearer ${options.apiKey()}`,
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
