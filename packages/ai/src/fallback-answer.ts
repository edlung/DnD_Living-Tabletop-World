import type { AiAttemptView, AttemptBillingView } from '@ltw/contracts';

import {
  DENIAL_CODES,
  MALFORMED_CODES,
  SUSPECT_CODES,
  type AttemptCharge,
  type DenialCode,
  type MalformedCode,
  type ProviderKind,
  type SuspectCode,
  type TokenUsage,
} from './providers.ts';

/**
 * How the fallback policy reads a provider's resolution (docs/adr/0032-live-ai.md, B1 repair 3 and
 * B2): once, keeping only well-formed facts. Pure helpers for `fallback.ts`.
 */
const MAX_OUTPUT_CHARS = 8 * 1024;

export function serialize(output: unknown): string {
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

/** Whether `output` is a decline envelope; an output whose reading throws is not one. */
export function isDeclineEnvelope(output: unknown): boolean {
  try {
    return (
      typeof output === 'object' &&
      output !== null &&
      (output as { readonly kind?: unknown }).kind === 'decline'
    );
  } catch {
    return false;
  }
}

export type Facts = Pick<AiAttemptView, 'model' | 'usage'> & {
  readonly charge: AttemptCharge | null;
};

/** A provider's resolution as the policy reads it, copied once with well-formed facts only. */
export type Answer =
  | { readonly kind: 'denied'; readonly code: DenialCode }
  | (Facts &
      (
        | { readonly kind: 'output'; readonly output: unknown }
        | { readonly kind: 'refusal' }
        | { readonly kind: 'malformed'; readonly code: MalformedCode }
        | { readonly kind: 'suspect'; readonly code: SuspectCode }
      ));

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isOneOf = <C extends string>(codes: readonly C[], value: unknown): value is C =>
  (codes as readonly unknown[]).includes(value);
const MICROS = /^(0|[1-9][0-9]{0,18})$/;

function usageOf(value: unknown): TokenUsage | null {
  if (typeof value !== 'object' || value === null) return null;
  const { inputTokens, outputTokens } = value as Partial<Record<keyof TokenUsage, unknown>>;
  return isCount(inputTokens) && isCount(outputTokens) ? { inputTokens, outputTokens } : null;
}

/** A well-formed charge, or null (then the attempt's cost is unknown, never zero). */
function chargeOf(value: unknown): AttemptCharge | null {
  if (typeof value !== 'object' || value === null) return null;
  const { pricingVersion, reservedMicros, costMicros } = value as Record<string, unknown>;
  const micros = (text: unknown): text is string => typeof text === 'string' && MICROS.test(text);
  if (typeof pricingVersion !== 'string' || !micros(reservedMicros)) return null;
  if (costMicros !== null && !micros(costMicros)) return null;
  return { pricingVersion, reservedMicros, costMicros };
}

/**
 * Reads a resolution once (B1 repair 3). Anything but an object with a known kind (and, where the
 * kind has one, a known code), or a value whose reading throws, is null: a non-response, never a
 * source of model, usage or output. A model, usage or charge that is not well-formed is unknown.
 */
export function answerOf(value: unknown): Answer | null {
  try {
    if (typeof value !== 'object' || value === null) return null;
    const fields = value as Readonly<Record<string, unknown>>;
    const kind = fields['kind'];
    const code = fields['code'];
    if (kind === 'denied') return isOneOf(DENIAL_CODES, code) ? { kind, code } : null;
    if (kind !== 'output' && kind !== 'refusal' && kind !== 'malformed' && kind !== 'suspect') {
      return null;
    }
    const model = fields['model'];
    const facts: Facts = {
      model: typeof model === 'string' ? model : null,
      usage: usageOf(fields['usage']),
      charge: chargeOf(fields['charge']),
    };
    switch (kind) {
      case 'output':
        return { kind, output: fields['output'], ...facts };
      case 'refusal':
        return { kind, ...facts };
      case 'malformed':
        return isOneOf(MALFORMED_CODES, code) ? { kind, code, ...facts } : null;
      case 'suspect':
        return isOneOf(SUSPECT_CODES, code) ? { kind, code, ...facts } : null;
    }
  } catch {
    return null;
  }
}

/** A denied attempt was never dispatched: no model, and known zero usage (not unknown). */
export const factsOf = (answer: Answer): Pick<AiAttemptView, 'model' | 'usage'> =>
  answer.kind === 'denied'
    ? { model: null, usage: { inputTokens: 0, outputTokens: 0 } }
    : { model: answer.model, usage: answer.usage };

const ZERO = { pricingVersion: null, reservedMicros: null, costMicros: '0' } as const;
const UNKNOWN: AttemptBillingView = {
  status: 'unknown',
  pricingVersion: null,
  reservedMicros: null,
  costMicros: null,
};

/**
 * The cost an attempt's trace records at freeze (B2). The local provider costs nothing; a denial or
 * proven not-started transport was never dispatched; a remote answer carries the wrapper's charge;
 * anything else remote is unknown (the reservation stays held), never zero.
 */
export function billingOf(
  kind: ProviderKind,
  outcome: { readonly answer: Answer } | { readonly notStarted: boolean },
): AttemptBillingView {
  if (kind === 'local') return { status: 'local', ...ZERO };
  if ('notStarted' in outcome)
    return outcome.notStarted ? { status: 'not_dispatched', ...ZERO } : UNKNOWN;
  const { answer } = outcome;
  if (answer.kind === 'denied') return { status: 'not_dispatched', ...ZERO };
  if (answer.charge === null) return UNKNOWN;
  return { status: answer.charge.costMicros === null ? 'unknown' : 'known', ...answer.charge };
}
