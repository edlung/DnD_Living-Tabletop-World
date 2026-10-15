import { describe, expect, it } from 'vitest';

import { CLAUDE_SONNET_5_5 } from '../../ai/catalog-sonnet-5-5.ts';
import { estimateMarkdown, sessionEstimate } from './session-estimate.ts';

/**
 * The 45-minute session estimate (design §4) for the runtime configuration of owner decisions 6:
 * Sonnet 5.5 for DM intents, NPC dialogue and Chronicle; rankings by the deterministic Context
 * Engine, at zero paid cost. A Sonnet-relevance alternative is shown apart, labelled. Measured
 * bases use the known charge of dispatched attempts (every billed input class at its rate), never
 * token counts alone. The run's known charges and holds are reported apart.
 */
const capability = (estimate: ReturnType<typeof sessionEstimate>, name: string) =>
  estimate.capabilities.find((c) => c.capability === name);

describe('the session estimate', () => {
  it('prices the disclosed workload, with rankings at zero paid cost', () => {
    const estimate = sessionEstimate(CLAUDE_SONNET_5_5);
    // Low: 60 × (1,500 × 2 + 100 × 10) + 5 × (3,000 × 2 + 300 × 10) + 2 × (3,000 × 2 + 1,000 × 10).
    expect(estimate.lowMicros).toBe(240_000n + 45_000n + 32_000n);
    // High: every assumed input token at the highest priced input rate (2.5), high output.
    expect(estimate.highMicros).toBe(1_500_000n + 325_000n + 220_000n);
    expect(estimate.highWithRepairsMicros).toBe(estimate.highMicros * 2n);
    expect(capability(estimate, 'fast-context')).toMatchObject({
      requests: 100,
      paid: false,
      lowMicros: 0n,
      highMicros: 0n,
      holdPerAttemptMicros: 0n,
    });
    expect(
      Object.fromEntries(
        estimate.capabilities
          .filter((c) => c.paid)
          .map((c) => [c.capability, c.holdPerAttemptMicros]),
      ),
    ).toEqual({ 'npc-dialogue': 2_540_960n, reasoning: 2_581_920n, narrative: 2_622_880n });
    // The alternative is separate and never in the totals.
    expect(estimate.sonnetRelevance).toMatchObject({
      capability: 'fast-context',
      paid: true,
      lowMicros: 250_000n,
      highMicros: 1_350_000n,
      holdPerAttemptMicros: 2_520_480n,
    });
  });

  it('measures from known charges of dispatched attempts, every input class included', () => {
    // 200 input, 3,000 five-minute cache-write and 800 output tokens: 400 + 7,500 + 8,000 µ$.
    const estimate = sessionEstimate(CLAUDE_SONNET_5_5, {
      reasoning: [{ chargeMicros: 15_900n }, { chargeMicros: 21_000n }],
    });
    expect(capability(estimate, 'reasoning')).toMatchObject({
      basis: 'measured: known charges of 2 request(s) in this run',
      lowMicros: 5n * 15_900n,
      highMicros: 5n * 21_000n,
    });
    // Other capabilities keep their assumed basis.
    expect(capability(estimate, 'npc-dialogue')?.basis).toMatch(/^assumed/);
  });

  it('measures the ranking alternative only from ranking samples', () => {
    const estimate = sessionEstimate(CLAUDE_SONNET_5_5, {
      'fast-context': [{ chargeMicros: 2_600n }],
    });
    expect(capability(estimate, 'fast-context')).toMatchObject({ paid: false, lowMicros: 0n });
    expect(estimate.sonnetRelevance).toMatchObject({
      lowMicros: 260_000n,
      highMicros: 260_000n,
      basis: 'measured: known charges of 1 request(s) in this run',
    });
  });

  it('labels the estimate and keeps known charges, holds and unknowns apart', () => {
    const text = estimateMarkdown(sessionEstimate(CLAUDE_SONNET_5_5), {
      knownMicros: 2_200n,
      heldMicros: 2_520_480n,
      openAttempts: 1,
      remoteAttempts: 3,
    }).join('\n');
    expect(text).toMatch(/ESTIMATE, not a measured bill/);
    expect(text).toContain('$0.317000 to $2.045000');
    expect(text).toMatch(/fast-context \| 100 \| deterministic Context Engine/);
    expect(text).toMatch(/Alternative, not the runtime configuration/);
    expect(text).toContain('$0.250000 to $1.350000');
    expect(text).toContain('Known charges (settled): $0.002200');
    expect(text).toContain('Outstanding holds (no terminal accounting): $2.520480 over 1 attempt');
    expect(text).toMatch(/share the same session, campaign/);
  });
});
