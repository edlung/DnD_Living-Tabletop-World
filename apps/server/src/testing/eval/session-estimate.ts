import { BILLING_DIMENSIONS, formatDollars, reservationMicros } from '../../ai/accounting/money.ts';
import type { CatalogEntry } from '../../ai/catalog.ts';
import { ANTHROPIC_REQUEST_SETTINGS } from '../../ai/request-settings.ts';
import type { Capability } from './eval-rows.ts';

/**
 * The 45-minute session estimate (docs/STAGE_300_REMEDIATION_DESIGN.md §4; ADR 0032, checkpoint
 * C) for the runtime configuration of owner decisions 6: Sonnet 5.5 for DM intents, NPC dialogue
 * and Chronicle, and relevance ranking by the deterministic Context Engine with no paid model. A
 * Sonnet-relevance alternative is computed apart, labelled, and never in the totals. It is a
 * WORKLOAD ESTIMATE, not a measured bill: the workload is disclosed, prices come from the verified
 * catalog entry, and each capability's basis is either the run's measured known charges (one per
 * request, every billed usage class at its rate) or the disclosed token assumptions below. Known
 * charges, outstanding holds and unknowns of the run are reported separately.
 */
export const SESSION_WORKLOAD: Readonly<Record<Capability, number>> = Object.freeze({
  'npc-dialogue': 60,
  reasoning: 5,
  narrative: 2,
  'fast-context': 100,
});

/** Paid at runtime (owner decisions 6): rankings are deterministic. */
const RUNTIME_PAID: ReadonlySet<Capability> = new Set(['npc-dialogue', 'reasoning', 'narrative']);

export interface TokenRange {
  /** Every billed input token: uncached input, cache writes and cache reads together. */
  readonly input: readonly [number, number];
  /** Output including adaptive thinking, within the capability's `max_tokens`. */
  readonly output: readonly [number, number];
}

/** ASSUMED per-request tokens (not measured; no live run exists after the remediation). */
export const ASSUMED_TOKENS: Readonly<Record<Capability, TokenRange>> = Object.freeze({
  'npc-dialogue': { input: [1_500, 4_000], output: [100, 1_500] },
  reasoning: { input: [3_000, 10_000], output: [300, 4_000] },
  narrative: { input: [3_000, 12_000], output: [1_000, 8_000] },
  'fast-context': { input: [1_000, 3_000], output: [50, 600] },
});

/** One request's measured known charge (its dispatched attempts' terminal charges). */
export interface UsageSample {
  readonly chargeMicros: bigint;
}

export interface CapabilityEstimate {
  readonly capability: Capability;
  readonly requests: number;
  /** Whether a paid model serves it in this configuration. */
  readonly paid: boolean;
  readonly basis: string;
  readonly lowMicros: bigint;
  readonly highMicros: bigint;
  /** The admission hold of one attempt: the full context plus `max_tokens` (verified bound). */
  readonly holdPerAttemptMicros: bigint;
}

export interface SessionEstimate {
  readonly pricingVersion: string;
  /** The runtime configuration; totals cover these only. */
  readonly capabilities: readonly CapabilityEstimate[];
  readonly lowMicros: bigint;
  readonly highMicros: bigint;
  /** The high end if every paid request cost twice its high end (one more attempt each). */
  readonly highWithRepairsMicros: bigint;
  /** The alternative of Sonnet 5.5 relevance ranking, apart from the totals. */
  readonly sonnetRelevance: CapabilityEstimate;
}

const INPUT_DIMENSIONS = BILLING_DIMENSIONS.filter((dimension) => dimension !== 'output');

/**
 * Low: every input token at the uncached rate. High: every input token at the highest priced
 * input rate of the entry (an upper bound for those tokens whatever their class). Output at its
 * rate.
 */
function priced(entry: CatalogEntry, input: number, output: number, end: 'low' | 'high'): bigint {
  const inputMicros = INPUT_DIMENSIONS.filter((dimension) =>
    entry.pricing.tiers.some((tier) => tier.rates[dimension] !== undefined),
  )
    .filter((dimension) => end === 'high' || dimension === 'uncachedInput')
    .map((dimension) => reservationMicros(entry.pricing, { [dimension]: input }))
    .reduce((best, micros) => (micros > best ? micros : best), 0n);
  return inputMicros + reservationMicros(entry.pricing, { output });
}

function paidEstimate(
  entry: CatalogEntry,
  capability: Capability,
  measured: readonly UsageSample[],
): CapabilityEstimate {
  const requests = BigInt(SESSION_WORKLOAD[capability]);
  const holdPerAttemptMicros = priced(
    entry,
    entry.limits.maxInputTokens,
    ANTHROPIC_REQUEST_SETTINGS[capability].maxTokens,
    'high',
  );
  const common = { capability, requests: SESSION_WORKLOAD[capability], paid: true };
  if (measured.length > 0) {
    const charges = measured.map((sample) => sample.chargeMicros);
    const min = charges.reduce((a, b) => (b < a ? b : a));
    const max = charges.reduce((a, b) => (b > a ? b : a));
    return {
      ...common,
      basis: `measured: known charges of ${String(measured.length)} request(s) in this run`,
      lowMicros: min * requests,
      highMicros: max * requests,
      holdPerAttemptMicros,
    };
  }
  const { input, output } = ASSUMED_TOKENS[capability];
  return {
    ...common,
    basis: 'assumed token ranges (not measured)',
    lowMicros: priced(entry, input[0], output[0], 'low') * requests,
    highMicros: priced(entry, input[1], output[1], 'high') * requests,
    holdPerAttemptMicros,
  };
}

export function sessionEstimate(
  entry: CatalogEntry,
  samples: Partial<Readonly<Record<Capability, readonly UsageSample[]>>> = {},
): SessionEstimate {
  const capabilities = (Object.keys(SESSION_WORKLOAD) as Capability[]).map(
    (capability): CapabilityEstimate =>
      RUNTIME_PAID.has(capability)
        ? paidEstimate(entry, capability, samples[capability] ?? [])
        : {
            capability,
            requests: SESSION_WORKLOAD[capability],
            paid: false,
            basis: 'deterministic Context Engine, no paid model (owner decisions 6)',
            lowMicros: 0n,
            highMicros: 0n,
            holdPerAttemptMicros: 0n,
          },
  );
  const sum = (pick: (estimate: CapabilityEstimate) => bigint) =>
    capabilities.reduce((total, estimate) => total + pick(estimate), 0n);
  const highMicros = sum((estimate) => estimate.highMicros);
  return {
    pricingVersion: entry.pricing.version,
    capabilities,
    lowMicros: sum((estimate) => estimate.lowMicros),
    highMicros,
    highWithRepairsMicros: highMicros * 2n,
    sonnetRelevance: paidEstimate(entry, 'fast-context', samples['fast-context'] ?? []),
  };
}

/** The run's own accounting, kept apart from the estimate. */
export interface RunCharges {
  readonly knownMicros: bigint;
  readonly heldMicros: bigint;
  readonly openAttempts: number;
  readonly remoteAttempts: number;
}

const tableRow = (c: CapabilityEstimate) =>
  `| ${c.capability} | ${String(c.requests)} | ${c.basis} | ${formatDollars(c.lowMicros)} | ${formatDollars(c.highMicros)} | ${c.paid ? formatDollars(c.holdPerAttemptMicros) : 'none'} |`;

export function estimateMarkdown(estimate: SessionEstimate, charges: RunCharges): string[] {
  const workload = (Object.keys(SESSION_WORKLOAD) as Capability[])
    .map((capability) => `${String(SESSION_WORKLOAD[capability])} ${capability}`)
    .join(', ');
  const alternative = estimate.sonnetRelevance;
  return [
    '## 45-minute session estimate (runtime: Sonnet 5.5, deterministic ranking) — ESTIMATE, not a measured bill',
    '',
    `Disclosed workload: ${workload}. Prices: verified catalog \`${estimate.pricingVersion}\`.`,
    'Rankings use the deterministic Context Engine at runtime (owner decisions 6): no paid model.',
    'Assumed basis: low = low token counts, all input uncached, no repair; high = high token counts,',
    'every input token at the highest priced input rate. Measured basis: the lowest and highest',
    'known charge of the run’s requests (all billed input classes at their rates; requests never',
    'dispatched or with a held attempt are excluded).',
    '',
    '| capability | requests | basis | low | high | hold per attempt |',
    '| --- | --- | --- | --- | --- | --- |',
    ...estimate.capabilities.map(tableRow),
    '',
    `Range: ${formatDollars(estimate.lowMicros)} to ${formatDollars(estimate.highMicros)}; if every`,
    `paid request cost twice its high end: up to ${formatDollars(estimate.highWithRepairsMicros)}.`,
    '',
    `Alternative, not the runtime configuration: Sonnet 5.5 relevance for ${String(alternative.requests)} rankings (${alternative.basis}) would add ${formatDollars(alternative.lowMicros)} to ${formatDollars(alternative.highMicros)}, with a hold of ${formatDollars(alternative.holdPerAttemptMicros)} per attempt.`,
    '',
    'Capacity, not cost: every paid attempt is admitted against a hold of the full 1,000,000-token',
    'context plus its `max_tokens` (no verified tokenizer bound), about $2.54–$2.63. A session or',
    'campaign ceiling below one hold admits nothing; concurrent requests need one hold each; and an',
    'attempt that times out after dispatch keeps its full hold until operator reconciliation.',
    'Player and DM requests share the same session, campaign, stage and account capacity.',
    '',
    '### This run’s accounting (separate from the estimate)',
    '',
    `- Remote attempts: ${String(charges.remoteAttempts)}`,
    `- Known charges (settled): ${formatDollars(charges.knownMicros)}`,
    `- Outstanding holds (no terminal accounting): ${formatDollars(charges.heldMicros)} over ${String(charges.openAttempts)} attempt(s)`,
    `- Unknown: the actual charge of each held attempt until reconciled`,
    '',
  ];
}
