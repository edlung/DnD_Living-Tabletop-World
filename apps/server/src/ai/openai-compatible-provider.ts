import { ProviderError, type AiProvider, type ProviderRequest } from '@ltw/ai';
import { z } from 'zod';

/**
 * An adapter for OpenAI-compatible chat APIs (docs/adr/0032-live-ai.md), used for DeepSeek.
 * Structured output is a function call the model is told to make; thinking is switched off
 * because the output is a short structured reply and reasoning tokens are billed and slow.
 * Errors carry a code and a fixed message only: never the key, the request, or the body.
 */
export interface OpenAiCompatibleOptions {
  readonly id: string;
  readonly baseUrl: string;
  /** Read only when a request is sent; never logged. */
  readonly apiKey: () => string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxTokens?: number;
  /** Provider-specific switches merged into the body (for DeepSeek: `thinking`). */
  readonly extraBody?: Readonly<Record<string, unknown>>;
  readonly fetch?: typeof fetch;
}

const responseSchema = z.looseObject({
  model: z.string().optional(),
  choices: z
    .array(
      z.looseObject({
        finish_reason: z.string().nullable().optional(),
        message: z.looseObject({
          tool_calls: z
            .array(
              z.looseObject({
                function: z.looseObject({ name: z.string(), arguments: z.string() }),
              }),
            )
            .optional(),
        }),
      }),
    )
    .min(1),
  usage: z.looseObject({ prompt_tokens: z.number(), completion_tokens: z.number() }).optional(),
});

export function createOpenAiCompatibleProvider(options: OpenAiCompatibleOptions): AiProvider {
  const send = options.fetch ?? fetch;
  return {
    id: options.id,
    generate: async (request: ProviderRequest) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, options.timeoutMs);
      const signal = request.signal
        ? AbortSignal.any([controller.signal, request.signal])
        : controller.signal;
      let body: unknown;
      try {
        const response = await send(`${options.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey()}`,
          },
          body: JSON.stringify({
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
            ...options.extraBody,
          }),
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
        if (signal.aborted)
          throw new ProviderError('TIMEOUT', 'provider timed out', { cause: error });
        throw new ProviderError('UNAVAILABLE', 'provider unreachable', { cause: error });
      } finally {
        clearTimeout(timer);
      }
      const parsed = responseSchema.safeParse(body);
      const choice = parsed.success ? parsed.data.choices[0] : undefined;
      if (!parsed.success || choice?.finish_reason === 'length') {
        throw new ProviderError('BAD_RESPONSE', 'provider output incomplete');
      }
      const call = choice?.message.tool_calls?.find((c) => c.function.name === request.output.name);
      if (!call) throw new ProviderError('BAD_RESPONSE', 'provider returned no structured output');
      let output: unknown;
      try {
        output = JSON.parse(call.function.arguments);
      } catch (error) {
        throw new ProviderError('BAD_RESPONSE', 'provider output unreadable', { cause: error });
      }
      const usage = parsed.data.usage;
      return {
        output,
        model: parsed.data.model ?? options.model,
        usage: usage
          ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }
          : null,
      };
    },
  };
}
