import { ProviderError, type AiProvider, type ProviderRequest } from '@ltw/ai';
import { z } from 'zod';

/**
 * The Anthropic Messages API adapter (docs/adr/0017-ai-gateway.md §2):
 * structured output as a forced tool call, over `fetch`. Errors carry a code
 * and a fixed message only: never the key, the request, or the response body.
 * A call stops at its own timeout, or when the request's `signal` aborts
 * (a caller's time budget, ADR 0021); either is `TIMEOUT`.
 */
export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 4_096;

export interface AnthropicOptions {
  /** Read only when a request is sent; never logged. */
  readonly apiKey: () => string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly fetch?: typeof fetch;
}

/** The parts of a Messages API response the adapter reads; anything else is ignored. */
const messagesResponseSchema = z.looseObject({
  model: z.string().optional(),
  stop_reason: z.string().nullable().optional(),
  content: z.array(
    z.looseObject({ type: z.string(), name: z.string().optional(), input: z.unknown().optional() }),
  ),
  usage: z.looseObject({ input_tokens: z.number(), output_tokens: z.number() }).optional(),
});

function bodyOf(model: string, request: ProviderRequest): string {
  return JSON.stringify({
    model,
    max_tokens: MAX_TOKENS,
    system: request.system,
    messages: [{ role: 'user', content: request.prompt }],
    tools: [
      {
        name: request.output.name,
        description: request.output.description,
        input_schema: request.output.schema,
      },
    ],
    tool_choice: { type: 'tool', name: request.output.name },
  });
}

export function createAnthropicProvider(options: AnthropicOptions): AiProvider {
  const send = options.fetch ?? fetch;
  return {
    id: 'anthropic',
    generate: async (request) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, options.timeoutMs);
      // The caller's own budget (ADR 0021) stops the call too.
      const signal = request.signal
        ? AbortSignal.any([controller.signal, request.signal])
        : controller.signal;
      let response: Response;
      let body: unknown;
      try {
        response = await send(ANTHROPIC_MESSAGES_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': options.apiKey(),
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: bodyOf(options.model, request),
          signal,
        });
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          throw new ProviderError(
            retryable ? 'UNAVAILABLE' : 'BAD_RESPONSE',
            `provider responded ${String(response.status)}`,
          );
        }
        body = await response.json().catch((error: unknown) => {
          if (signal.aborted) throw error;
          throw new ProviderError('BAD_RESPONSE', 'provider output unreadable', { cause: error });
        });
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (signal.aborted) {
          throw new ProviderError('TIMEOUT', 'provider timed out', { cause: error });
        }
        throw new ProviderError('UNAVAILABLE', 'provider unreachable', { cause: error });
      } finally {
        clearTimeout(timer);
      }

      const parsed = messagesResponseSchema.safeParse(body);
      if (!parsed.success || parsed.data.stop_reason === 'max_tokens') {
        throw new ProviderError('BAD_RESPONSE', 'provider output incomplete');
      }
      const { content, model, usage } = parsed.data;
      const call = content.find(
        (block) => block.type === 'tool_use' && block.name === request.output.name,
      );
      if (!call || call.input === undefined) {
        throw new ProviderError('BAD_RESPONSE', 'provider returned no structured output');
      }
      return {
        output: call.input,
        model: model ?? options.model,
        usage: usage
          ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }
          : null,
      };
    },
  };
}
