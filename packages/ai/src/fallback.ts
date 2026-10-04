import type { AiAttemptView, AttemptKind } from '@ltw/contracts';

import {
  failureCode,
  type AiProvider,
  type ProviderRequest,
  type RepairNote,
} from './providers.ts';

/**
 * The fallback policy (owner decision, docs/adr/0017-ai-gateway.md §5), for
 * every AI use case (DM intents; NPC replies, ADR 0020 §3).
 * - Provider failure: the next provider for the capability is tried once,
 *   with the identical request; with none left, `AI_UNAVAILABLE`.
 * - Invalid output: one repair attempt on the same provider, given its
 *   output and the issues; still invalid, `INVALID_OUTPUT`.
 * At most one switch and one repair per request. Every attempt is built
 * from the same context by `build`, so no fallback widens what the
 * provider sees, and nothing here can commit anything.
 */
export type OutputCheck<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly string[] };

export type FallbackResult<T> =
  | {
      readonly status: 'VALID';
      readonly value: T;
      readonly attempts: readonly AiAttemptView[];
    }
  | {
      readonly status: 'INVALID_OUTPUT';
      readonly issues: readonly string[];
      readonly attempts: readonly AiAttemptView[];
    }
  | { readonly status: 'AI_UNAVAILABLE'; readonly attempts: readonly AiAttemptView[] };

export interface FallbackDeps<T> {
  readonly providers: readonly AiProvider[];
  readonly build: (repair: RepairNote | null) => ProviderRequest;
  readonly validate: (output: unknown) => OutputCheck<T>;
  /** Milliseconds, for latency only. */
  readonly nowMs: () => number;
}

const MAX_OUTPUT_CHARS = 8 * 1024;

function serialize(output: unknown): string {
  let text: string;
  try {
    // JSON.stringify returns undefined for undefined and functions, despite its type.
    const raw = JSON.stringify(output) as string | undefined;
    text = raw ?? 'undefined';
  } catch {
    text = '"(unserializable output)"';
  }
  return text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}…` : text;
}

export async function runWithFallback<T>(deps: FallbackDeps<T>): Promise<FallbackResult<T>> {
  const attempts: AiAttemptView[] = [];
  let index = 0;
  let kind: AttemptKind = 'initial';
  let repair: RepairNote | null = null;
  let switched = false;
  let repaired = false;

  while (index < deps.providers.length) {
    const provider = deps.providers[index];
    if (!provider) break;
    const started = deps.nowMs();
    const base = { provider: provider.id, kind };
    let response;
    try {
      response = await provider.generate(deps.build(repair));
    } catch (error) {
      attempts.push({
        ...base,
        model: null,
        outcome: 'error',
        error: failureCode(error),
        issues: [],
        output: null,
        latencyMs: Math.round(deps.nowMs() - started),
        usage: null,
      });
      if (switched || index + 1 >= deps.providers.length) break;
      switched = true;
      index += 1;
      kind = 'fallback';
      repair = null;
      continue;
    }
    const check = deps.validate(response.output);
    attempts.push({
      ...base,
      model: response.model,
      outcome: check.ok ? 'valid' : 'invalid',
      error: null,
      issues: check.ok ? [] : check.issues,
      output: serialize(response.output),
      latencyMs: Math.round(deps.nowMs() - started),
      usage: response.usage,
    });
    if (check.ok) return { status: 'VALID', value: check.value, attempts };
    if (repaired) return { status: 'INVALID_OUTPUT', issues: check.issues, attempts };
    repaired = true;
    kind = 'repair';
    repair = { output: response.output, issues: check.issues };
  }
  return { status: 'AI_UNAVAILABLE', attempts };
}
