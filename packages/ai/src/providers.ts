import type { AiCapability } from '@ltw/contracts';

import type { BuiltContext } from './context-builder.ts';

/**
 * The provider port (docs/adr/0017-ai-gateway.md §2). Providers are
 * replaceable behind capabilities (invariant 21); adapters with I/O live in
 * the server. A provider only answers: it receives data and returns data.
 */

/** The structured output a request expects, as a named JSON Schema. */
export interface StructuredOutputSpec {
  readonly name: string;
  readonly description: string;
  readonly schema: Readonly<Record<string, unknown>>;
}

/** A previous invalid output and why it failed, for the one repair attempt. */
export interface RepairNote {
  readonly output: unknown;
  readonly issues: readonly string[];
}

/** The structured task behind the prose, for providers that do not read prose. */
export interface IntentTask {
  readonly kind: 'dm-intent';
  readonly text: string;
  readonly context: BuiltContext;
  readonly repair: RepairNote | null;
}

export interface ProviderRequest {
  readonly capability: AiCapability;
  readonly system: string;
  readonly prompt: string;
  readonly output: StructuredOutputSpec;
  readonly task: IntentTask;
}

export interface ProviderResponse {
  /** The structured output, parsed but not yet validated. */
  readonly output: unknown;
  readonly model: string;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number } | null;
}

export interface AiProvider {
  /** Stable name for routing and traces, for example `anthropic` or `local`. */
  readonly id: string;
  generate(request: ProviderRequest): Promise<ProviderResponse>;
}

export const PROVIDER_ERROR_CODES = ['UNAVAILABLE', 'TIMEOUT', 'BAD_RESPONSE'] as const;
export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

/** A provider call that produced no output. Never carries secrets or request data. */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProviderError';
    this.code = code;
  }
}

/** Any failure, as the code a trace records; unknown errors count as unavailability. */
export const failureCode = (error: unknown): ProviderErrorCode =>
  error instanceof ProviderError ? error.code : 'UNAVAILABLE';
