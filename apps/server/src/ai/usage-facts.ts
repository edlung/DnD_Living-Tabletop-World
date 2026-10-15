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
  /**
   * Informational string fields and their only accepted values. An empty set accepts only null
   * (or absence): any value at all is unrecognized.
   */
  readonly labels: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * Object fields holding counts that may only be zero (features never requested, such as server
   * tools). Recorded as the informational label `field.count` = `'0'`; a nonzero or malformed
   * count is unrecognized.
   */
  readonly zeroCounts: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * An array field restating the usage per internal iteration (catalog verification of
   * 2026-10-12): accepted only when it is nonempty, every entry has `type` equal to the given value
   * and carries only the spec's counts (and nested counts), and the entries' sums equal the
   * top-level value of every count they restate, always including the required input and output.
   * Recorded as the informational label `field` = the type; anything else is unrecognized.
   */
  readonly iterations: { readonly field: string; readonly type: string } | null;
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
  readonly zeroCounts?: Readonly<Record<string, readonly string[]>>;
  readonly iterations?: { readonly field: string; readonly type: string };
  readonly input: string;
  readonly output: string;
}): UsageSpec {
  const sets = (groups: Readonly<Record<string, readonly string[]>> = {}) =>
    new Map(Object.entries(groups).map(([name, members]) => [name, new Set(members)]));
  return {
    counts: new Set(spec.counts),
    nested: sets(spec.nested),
    labels: sets(spec.labels),
    zeroCounts: sets(spec.zeroCounts),
    iterations: spec.iterations ?? null,
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

/**
 * The counts of one iteration entry (`field` or `field.nested`), or null when the entry has another
 * type, an unknown field, a malformed count, or lacks the required input or output count.
 */
function iterationCounts(
  entry: unknown,
  spec: UsageSpec,
  type: string,
): Map<string, number> | null {
  if (!isRecord(entry) || entry['type'] !== type) return null;
  const counts = new Map<string, number>();
  for (const [field, value] of Object.entries(entry)) {
    if (field === 'type') continue;
    const nested = spec.nested.get(field);
    if (spec.counts.has(field)) {
      if (isCount(value)) counts.set(field, value);
      else if (value !== null) return null;
    } else if (nested) {
      if (value === null) continue;
      if (!isRecord(value)) return null;
      for (const [inner, count] of Object.entries(value)) {
        if (!nested.has(inner)) return null;
        if (isCount(count)) counts.set(`${field}.${inner}`, count);
        else if (count !== null) return null;
      }
    } else return null;
  }
  return counts.has(spec.input) && counts.has(spec.output) ? counts : null;
}

/** Whether the iteration entries add up exactly to the top-level counts (B2 catalog record). */
function iterationsConsistent(
  value: unknown,
  spec: UsageSpec,
  type: string,
  totals: ReadonlyMap<string, number>,
): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const sums = new Map<string, number>();
  for (const entry of value as readonly unknown[]) {
    const counts = iterationCounts(entry, spec, type);
    if (counts === null) return false;
    for (const [name, count] of counts) sums.set(name, (sums.get(name) ?? 0) + count);
  }
  // Every count the entries restate, and always the required input and output, must match; a
  // top-level decomposition the entries do not restate (thinking tokens) is not compared.
  const names = new Set([...sums.keys(), spec.input, spec.output]);
  return [...names].every((name) => (sums.get(name) ?? 0) === (totals.get(name) ?? 0));
}

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
    let iterations: unknown = null;
    for (const [field, value] of Object.entries(raw)) {
      const nested = spec.nested.get(field);
      const labels = spec.labels.get(field);
      const zeros = spec.zeroCounts.get(field);
      if (spec.iterations?.field === field) {
        // Checked once every top-level count is known (below).
        iterations = value;
      } else if (zeros) {
        if (value === null) continue;
        if (!isRecord(value)) {
          unrecognized.push(field);
          continue;
        }
        for (const [inner, count] of Object.entries(value)) {
          if (zeros.has(inner) && count === 0) informational.set(`${field}.${inner}`, '0');
          else if (!(zeros.has(inner) && count === null)) {
            unrecognized.push(`${field}.${nameOf(inner)}`);
          }
        }
      } else if (spec.counts.has(field)) {
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
    if (spec.iterations !== null && iterations !== null) {
      const { field, type } = spec.iterations;
      if (iterationsConsistent(iterations, spec, type, dimensions)) {
        informational.set(field, type);
      } else unrecognized.push(field);
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
