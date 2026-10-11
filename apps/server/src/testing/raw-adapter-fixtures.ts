import { ProviderError, intentRequest, type ProviderRequest } from '@ltw/ai';

/**
 * Test support for the raw adapter suites (docs/adr/0032-live-ai.md, B1): the request, fake keys
 * and each adapter's response shapes and options. It never imports an adapter (only tests may:
 * see `gateway.test.ts`); tests construct adapters in their own files.
 */
export const KEY = 'sk-test-key-never-shown';
export const REQUEST: ProviderRequest = intentRequest(
  'Advance time by 1 hour.',
  {
    scope: 'PUBLIC',
    items: [{ sourceId: 'north-gate', kind: 'entity', text: 'north-gate (location): North Gate' }],
    entities: [{ entityId: 'north-gate', kind: 'location', name: 'North Gate' }],
    worldTime: 0,
  },
  null,
);
export const OUTPUT = {
  kind: 'proposal',
  proposal: { summary: 'An hour passes.', commands: [{ type: 'AdvanceWorldTime', by: 3_600 }] },
};
export const PROSE = 'Here is my proposal, as you asked.';

export interface MakeOptions {
  readonly fetch: typeof fetch;
  readonly apiKey?: () => string;
  readonly timeoutMs?: number;
  readonly acceptedModels?: readonly string[];
}

export interface AdapterFixture {
  readonly name: 'Anthropic' | 'OpenAI-compatible';
  readonly model: string;
  readonly usage: Record<string, unknown>;
  readonly tokens: { readonly inputTokens: number; readonly outputTokens: number };
  readonly reply: (options?: {
    readonly output?: unknown;
    readonly tool?: string | null;
    readonly stop?: 'refusal' | 'truncated';
    readonly model?: string;
    readonly usage?: unknown;
    readonly rawArguments?: string;
  }) => Record<string, unknown>;
  /** The tool schema the sent body carries. */
  readonly schemaOf: (body: Record<string, unknown>) => unknown;
}

export const ANTHROPIC: AdapterFixture = {
  name: 'Anthropic',
  model: 'claude-opus-5-5',
  usage: {
    input_tokens: 812,
    output_tokens: 64,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
    service_tier: 'standard',
  },
  tokens: { inputTokens: 812, outputTokens: 64 },
  reply: ({ output = OUTPUT, tool = 'propose_commands', stop, model, usage } = {}) => ({
    id: 'msg_01abc',
    model: model ?? 'claude-opus-5-5',
    stop_reason: stop === 'refusal' ? 'refusal' : stop === 'truncated' ? 'max_tokens' : 'tool_use',
    content: [
      { type: 'text', text: PROSE },
      ...(tool === null ? [] : [{ type: 'tool_use', id: 'toolu_1', name: tool, input: output }]),
    ],
    usage: usage === undefined ? ANTHROPIC.usage : usage,
  }),
  schemaOf: (body) => (body['tools'] as { input_schema: unknown }[])[0]?.input_schema,
};

export const DEEPSEEK: AdapterFixture = {
  name: 'OpenAI-compatible',
  model: 'deepseek-flash',
  usage: {
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
    prompt_cache_hit_tokens: 64,
    prompt_cache_miss_tokens: 36,
    prompt_tokens_details: { cached_tokens: 64 },
  },
  tokens: { inputTokens: 100, outputTokens: 20 },
  reply: ({
    output = OUTPUT,
    tool = 'propose_commands',
    stop,
    model,
    usage,
    rawArguments,
  } = {}) => ({
    id: 'chatcmpl-1',
    model: model ?? 'deepseek-flash',
    choices: [
      {
        finish_reason:
          stop === 'refusal' ? 'content_filter' : stop === 'truncated' ? 'length' : 'tool_calls',
        message: {
          content: PROSE,
          tool_calls:
            tool === null
              ? null
              : [
                  {
                    function: { name: tool, arguments: rawArguments ?? JSON.stringify(output) },
                  },
                ],
        },
      },
    ],
    usage: usage === undefined ? DEEPSEEK.usage : usage,
  }),
  schemaOf: (body) =>
    (body['tools'] as { function: { parameters: unknown } }[])[0]?.function.parameters,
};

/** Options for `createAnthropicProvider` with a fake key. */
export const anthropicOptions = (options: MakeOptions) => ({
  apiKey: () => KEY,
  model: ANTHROPIC.model,
  timeoutMs: 1_000,
  ...options,
});

/** Options for `createOpenAiCompatibleProvider` with a fake key. */
export const openAiOptions = (options: MakeOptions) => ({
  id: 'deepseek',
  baseUrl: 'https://example.test',
  apiKey: () => KEY,
  model: DEEPSEEK.model,
  timeoutMs: 1_000,
  thinking: 'disabled' as const,
  ...options,
});

export const NEVER = new AbortController().signal;

export async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProviderError) return error;
    throw error;
  }
  throw new Error('expected a ProviderError');
}
