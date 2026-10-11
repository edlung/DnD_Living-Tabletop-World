import type { AiCapability } from '@ltw/contracts';

import type { BuiltContext } from './context-builder.ts';
import type { DialoguePrompt } from './dialogue-prompt.ts';
import type { ChroniclePrompt } from './chronicle-prompt.ts';
import type { RelevancePrompt } from './relevance-prompt.ts';

/**
 * The provider port (docs/adr/0017-ai-gateway.md §2; docs/adr/0032-live-ai.md, checkpoint B1).
 * Providers are replaceable behind capabilities (invariant 21); adapters with I/O live in the
 * server. A provider only answers: it receives data and returns a classified response.
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

/** An NPC's reply (ADR 0020 §3): exactly what the prose says, with no IDs. */
export interface DialogueTask {
  readonly kind: 'npc-dialogue';
  readonly prompt: DialoguePrompt;
  readonly repair: RepairNote | null;
}

/** A relevance ranking (ADR 0021): the legal actions under opaque keys, with no IDs. */
export interface RelevanceTask {
  readonly kind: 'relevance';
  readonly prompt: RelevancePrompt;
  readonly repair: RepairNote | null;
}

/** A Chronicle chapter (ADR 0024 §3): entries under opaque keys, with no IDs. */
export interface ChronicleTask {
  readonly kind: 'chronicle';
  readonly prompt: ChroniclePrompt;
  readonly repair: RepairNote | null;
}

/** What an attempt asks. Cancellation travels separately (`AttemptContext`), never in the request. */
export interface ProviderRequest {
  readonly capability: AiCapability;
  readonly system: string;
  readonly prompt: string;
  readonly output: StructuredOutputSpec;
  readonly task: IntentTask | DialogueTask | RelevanceTask | ChronicleTask;
}

/** Per-attempt controls from the fallback policy. */
export interface AttemptContext {
  /** The caller's whole-request signal; aborted, no new transport starts. */
  readonly signal: AbortSignal;
  /** Called synchronously immediately before transport starts; never for a non-dispatched attempt. */
  readonly onStart: () => void;
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/**
 * Safe, opaque usage facts for later verification against a pricing catalog. Only allowlisted
 * fields with nonnegative safe-integer values are kept; anything else is named (never valued) in
 * `unrecognized`, which makes the response unverified billing (fail closed).
 */
export interface BillingFacts {
  readonly dimensions: Readonly<Record<string, number>>;
  readonly informational: Readonly<Record<string, string>>;
  readonly unrecognized: readonly string[];
}

/** Response metadata kept whatever the output's fate; never provider prose or error bodies. */
export interface ResponseFacts {
  /** The returned model identifier, when it is a safe identifier. */
  readonly model: string | null;
  readonly usage: TokenUsage | null;
  readonly billing: BillingFacts | null;
  /** The provider's request/message ID, when it is a safe identifier. */
  readonly providerRequestId: string | null;
}

/** Structured output missing or unusable: invalid output (one repair), not provider failure. */
export const MALFORMED_CODES = ['MISSING_TOOL', 'TRUNCATED', 'INVALID_JSON'] as const;
export type MalformedCode = (typeof MALFORMED_CODES)[number];

/** A response whose model or billing cannot be trusted: output discarded unseen. */
export const SUSPECT_CODES = ['UNEXPECTED_MODEL', 'UNVERIFIED_BILLING'] as const;
export type SuspectCode = (typeof SUSPECT_CODES)[number];

/** An attempt refused before dispatch by admission: zero usage, no transport. */
export const DENIAL_CODES = [
  'BUDGET_DENIED',
  'ADMISSION_DISABLED',
  'ADMISSION_UNAVAILABLE',
] as const;
export type DenialCode = (typeof DENIAL_CODES)[number];

export type ProviderResponse =
  | (ResponseFacts & { readonly kind: 'output'; readonly output: unknown })
  | (ResponseFacts & { readonly kind: 'refusal' })
  | (ResponseFacts & { readonly kind: 'malformed'; readonly code: MalformedCode })
  | (ResponseFacts & { readonly kind: 'suspect'; readonly code: SuspectCode })
  | { readonly kind: 'denied'; readonly code: DenialCode };

/** A structured output with no metadata (the local provider and test scripts). */
export const outputResponse = (output: unknown, model: string): ProviderResponse => ({
  kind: 'output',
  output,
  model,
  usage: null,
  billing: null,
  providerRequestId: null,
});

declare const ROUTED: unique symbol;

/**
 * `local`: the zero-cost deterministic provider from `createLocalProvider()`. `remote`: a metered
 * provider, routable only as an admitted wrapper (server composition checks both by identity).
 */
export type ProviderKind = 'local' | 'remote';

/**
 * A provider the router accepts. The brand cannot be written outside a cast: the local factory,
 * the server's admission wrapper (B2) and explicit test fixtures are the only sources, and server
 * composition verifies identity at runtime, so a forged brand never reaches runtime or evaluation.
 */
export interface RoutedProvider {
  /** Stable name for routing and traces, for example `anthropic` or `local`. */
  readonly id: string;
  readonly kind: ProviderKind;
  generate(request: ProviderRequest, attempt: AttemptContext): Promise<ProviderResponse>;
  readonly [ROUTED]: ProviderKind;
}

export type LocalProvider = RoutedProvider & { readonly kind: 'local' };
export type AdmittedProvider = RoutedProvider & { readonly kind: 'remote' };

/**
 * Package-internal (not exported from the package entry): attaches the brand type for the local
 * factory and test fixtures. It confers no server identity.
 */
export const branded = <K extends ProviderKind>(provider: {
  readonly id: string;
  readonly kind: K;
  readonly generate: RoutedProvider['generate'];
}): RoutedProvider & { readonly kind: K } =>
  provider as unknown as RoutedProvider & { readonly kind: K };

/**
 * Transport failures. `TRANSPORT_NOT_STARTED` is emitted only strictly before transport is invoked
 * (the one proof a reservation may be released); every other code after the start is uncertain.
 * `TIMEOUT` is the attempt's own bound; `CALLER_CANCELLED` the caller's whole-request signal.
 */
export const PROVIDER_ERROR_CODES = [
  'TRANSPORT_NOT_STARTED',
  'UNAVAILABLE',
  'TIMEOUT',
  'BAD_RESPONSE',
  'CALLER_CANCELLED',
] as const;
export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

/**
 * The code each genuine `ProviderError` was constructed with, by object identity: a Proxy, a copy
 * or an object made with its prototype is never found here (B1 repair 4).
 */
const constructedCodes = new WeakMap<object, unknown>();

/** A provider call that produced no response. Never carries secrets or request data. */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProviderError';
    this.code = code;
    constructedCodes.set(this, code);
  }
}

const isProviderErrorCode = (value: unknown): value is ProviderErrorCode =>
  (PROVIDER_ERROR_CODES as readonly unknown[]).includes(value);

/**
 * Any failure, as the fixed code a trace records (docs/adr/0032-live-ai.md, B1 repair 4). Never
 * throws, and reads `code` at most once. Only a genuine `ProviderError` whose code is allowlisted and
 * unchanged since construction keeps it; anything else (another error, a look-alike, a Proxy, an
 * unknown, changed or unreadable code) is `UNAVAILABLE`, an uncertain failure, so a
 * `TRANSPORT_NOT_STARTED` release proof is never inferred from an unverifiable rejection.
 */
export function failureCode(error: unknown): ProviderErrorCode {
  try {
    if (typeof error !== 'object' || error === null) return 'UNAVAILABLE';
    const constructed = constructedCodes.get(error);
    if (constructed === undefined) return 'UNAVAILABLE';
    const code: unknown = (error as { readonly code?: unknown }).code;
    return code === constructed && isProviderErrorCode(code) ? code : 'UNAVAILABLE';
  } catch {
    return 'UNAVAILABLE';
  }
}
