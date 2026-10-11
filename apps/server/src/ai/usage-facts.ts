import type { BillingFacts, TokenUsage } from '@ltw/ai';

/**
 * A provider's usage block as safe, opaque facts (docs/adr/0032-live-ai.md, B1). Only allowlisted
 * fields with nonnegative safe-integer counts (or null, meaning absent) and allowlisted label values
 * are kept; any other field, value or shape is named in `unrecognized`, never valued, which makes
 * the response unverified billing. Pricing these facts is the catalog's job (B2), not this one's.
 */
export interface UsageSpec {
  /** Top-level token counts. */
  readonly counts: ReadonlySet<string>;
  /** Object fields holding further counts, recorded as `field.count`. */
  readonly nested: ReadonlyMap<string, ReadonlySet<string>>;
  /** Informational string fields and their only accepted values. */
  readonly labels: ReadonlyMap<string, ReadonlySet<string>>;
  /** Required counts behind the attempt view's input/output usage. */
  readonly input: string;
  readonly output: string;
}

/**
 * Builds a spec whose lookups see only the names written here: `Set`/`Map` membership, never a
 * plain-object property, so a usage field named like an inherited property (`constructor`,
 * `__proto__`, `toString`) is never mistaken for an allowlisted one (B1 repair 1).
 */
export function usageSpec(spec: {
  readonly counts: readonly string[];
  readonly nested?: Readonly<Record<string, readonly string[]>>;
  readonly labels?: Readonly<Record<string, readonly string[]>>;
  readonly input: string;
  readonly output: string;
}): UsageSpec {
  const sets = (groups: Readonly<Record<string, readonly string[]>> = {}) =>
    new Map(Object.entries(groups).map(([name, members]) => [name, new Set(members)]));
  return {
    counts: new Set(spec.counts),
    nested: sets(spec.nested),
    labels: sets(spec.labels),
    input: spec.input,
    output: spec.output,
  };
}

const MAX_UNRECOGNIZED = 16;
const NAME = /^[A-Za-z0-9_]{1,64}$/;
const nameOf = (name: string) => (NAME.test(name) ? name : '(unnamed)');
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Own enumerable fields only (`Object.entries`), including an own `__proto__` from JSON. */
export function usageFacts(
  raw: unknown,
  spec: UsageSpec,
): { readonly usage: TokenUsage | null; readonly billing: BillingFacts | null } {
  if (raw === undefined || raw === null) return { usage: null, billing: null };
  const dimensions = new Map<string, number>();
  const informational = new Map<string, string>();
  const unrecognized: string[] = [];
  if (!isRecord(raw)) {
    unrecognized.push('usage');
  } else {
    for (const [field, value] of Object.entries(raw)) {
      const nested = spec.nested.get(field);
      const labels = spec.labels.get(field);
      if (spec.counts.has(field)) {
        if (isCount(value)) dimensions.set(field, value);
        else if (value !== null) unrecognized.push(field);
      } else if (nested) {
        if (value === null) continue;
        if (!isRecord(value)) {
          unrecognized.push(field);
          continue;
        }
        for (const [inner, count] of Object.entries(value)) {
          if (nested.has(inner) && isCount(count)) dimensions.set(`${field}.${inner}`, count);
          else if (!(nested.has(inner) && count === null)) {
            unrecognized.push(`${field}.${nameOf(inner)}`);
          }
        }
      } else if (labels) {
        if (typeof value === 'string' && labels.has(value)) informational.set(field, value);
        else if (value !== null) unrecognized.push(field);
      } else {
        unrecognized.push(nameOf(field));
      }
    }
    for (const required of [spec.input, spec.output]) {
      if (!dimensions.has(required) && !unrecognized.includes(required)) {
        unrecognized.push(required);
      }
    }
  }
  const input = dimensions.get(spec.input);
  const output = dimensions.get(spec.output);
  return {
    usage:
      input !== undefined && output !== undefined
        ? { inputTokens: input, outputTokens: output }
        : null,
    billing: {
      dimensions: Object.freeze(Object.fromEntries(dimensions)),
      informational: Object.freeze(Object.fromEntries(informational)),
      unrecognized: Object.freeze(unrecognized.slice(0, MAX_UNRECOGNIZED)),
    },
  };
}
