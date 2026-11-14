import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_USAGE,
  ANTHROPIC_VERSION,
} from '../../apps/server/src/ai/anthropic-provider.ts';
import { usageFacts } from '../../apps/server/src/ai/usage-facts.ts';

/**
 * Sends a body prepared by the project's Anthropic adapter as a stream. Long authoring answers
 * (several minutes) lose a silent non-streaming connection after about a minute on this machine;
 * a stream keeps data moving. The final message is rebuilt from the events and classified like
 * the adapter does: only the expected model, a tool call by name, usage read through the
 * adapter's own usage spec. Errors carry a code only, never the key or a body.
 */
export interface StreamResult {
  readonly kind: 'output' | 'refusal' | 'malformed' | 'suspect';
  readonly code: string | null;
  readonly output: unknown;
  readonly model: string | null;
  readonly providerRequestId: string | null;
  readonly usage: ReturnType<typeof usageFacts>['usage'];
  readonly billing: ReturnType<typeof usageFacts>['billing'];
}

type Json = Record<string, unknown>;
const isJson = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

export async function streamMessage(
  preparedBody: string,
  key: string,
  model: string,
  toolName: string,
  timeoutMs: number,
): Promise<StreamResult> {
  const body = { ...(JSON.parse(preparedBody) as Json), stream: true };
  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  }).catch(() => {
    throw Object.assign(new Error('provider unreachable'), { code: 'UNAVAILABLE' });
  });
  if (!response.ok || !response.body) {
    void response.body?.cancel().catch(() => undefined);
    throw Object.assign(new Error(`provider responded ${String(response.status)}`), {
      code: response.status === 429 || response.status >= 500 ? 'UNAVAILABLE' : 'BAD_RESPONSE',
    });
  }
  let message: Json = {};
  let usage: Json = {};
  let stop: unknown = null;
  const blocks: { type: string; name?: string; json: string }[] = [];
  let buffer = '';
  const decoder = new TextDecoder();
  const handle = (data: string) => {
    const event = JSON.parse(data) as Json;
    const type = event['type'];
    if (type === 'message_start' && isJson(event['message'])) {
      message = event['message'];
      if (isJson(message['usage'])) usage = { ...message['usage'] };
    } else if (type === 'content_block_start' && isJson(event['content_block'])) {
      const block = event['content_block'];
      blocks[Number(event['index'])] = {
        type: String(block['type']),
        ...(typeof block['name'] === 'string' ? { name: block['name'] } : {}),
        json: '',
      };
    } else if (type === 'content_block_delta' && isJson(event['delta'])) {
      const delta = event['delta'];
      const block = blocks[Number(event['index'])];
      if (block && delta['type'] === 'input_json_delta')
        block.json += typeof delta['partial_json'] === 'string' ? delta['partial_json'] : '';
    } else if (type === 'message_delta') {
      if (isJson(event['delta'])) stop = event['delta']['stop_reason'];
      if (isJson(event['usage'])) usage = { ...usage, ...event['usage'] };
    } else if (type === 'error') {
      throw Object.assign(new Error('provider stream error'), { code: 'UNAVAILABLE' });
    }
  };
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('');
      if (data) handle(data);
    }
  }
  const facts = {
    model: typeof message['model'] === 'string' ? message['model'] : null,
    providerRequestId: typeof message['id'] === 'string' ? message['id'] : null,
    ...usageFacts(usage, ANTHROPIC_USAGE),
  };
  const result = (kind: StreamResult['kind'], code: string | null, output: unknown = null) => ({
    kind,
    code,
    output,
    ...facts,
  });
  if (facts.model !== model) return result('suspect', 'UNEXPECTED_MODEL');
  if (facts.billing && facts.billing.unrecognized.length > 0)
    return result('suspect', 'UNVERIFIED_BILLING');
  if (stop === 'refusal') return result('refusal', null);
  if (stop === 'max_tokens' || stop === 'model_context_window_exceeded')
    return result('malformed', 'TRUNCATED');
  const call = blocks.find((b) => b.type === 'tool_use' && b.name === toolName);
  if (!call) return result('malformed', 'MISSING_TOOL');
  try {
    return result('output', null, JSON.parse(call.json || '{}'));
  } catch {
    return result('malformed', 'INVALID_JSON');
  }
}
