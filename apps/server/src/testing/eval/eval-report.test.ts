import { describe, expect, it } from 'vitest';

import { CLAUDE_SONNET_5_5 } from '../../ai/catalog-sonnet-5-5.ts';
import { usageSamples } from './eval-report.ts';
import type { Row } from './eval-rows.ts';
import { sessionEstimate } from './session-estimate.ts';

/**
 * Measured estimate samples (design §4): one sample per request, its known charge from durable
 * accounting (every billed input class at its verified rate). A request with an attempt that was
 * never dispatched only, or with a held attempt of unknown charge, gives no sample.
 */
const accounting = (measuredMicros: bigint | null) => ({
  remoteAttempts: measuredMicros === null ? 0 : 1,
  knownMicros: measuredMicros ?? 0n,
  heldMicros: 0n,
  openAttempts: 0,
  measuredMicros,
  returnedModels: [],
  providerRequestIds: 0,
});
const row = (attempts: Row['technical']['attempts'], measuredMicros: bigint | null): Row => ({
  case: 'c',
  semantic: { pass: null, outcome: '-', reason: null },
  technical: { status: 'PROPOSED', remoteValid: true, attempts },
  endToEndMs: 1,
  traceId: null,
  accounting: accounting(measuredMicros),
  note: '',
});
const attempt = (
  usage: { inputTokens: number; outputTokens: number } | null,
  error: string | null = null,
) => ({
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
  kind: 'initial',
  outcome: error === null ? 'valid' : 'error',
  error,
  issues: [],
  latencyMs: 1,
  usage,
});

describe('measured estimate samples', () => {
  it('take each request’s known charge, not its uncached input tokens', () => {
    // 200 input, 3,000 five-minute cache-write and 800 output tokens: 15,900 µ$ known; the
    // attempt view's usage (200 in, 800 out) alone would price 8,400 µ$.
    const samples = usageSamples({
      reasoning: {
        rows: [
          row([attempt({ inputTokens: 200, outputTokens: 800 })], 15_900n),
          // Not dispatched (admission denied): no accounting attempt, no sample.
          row(
            [{ ...attempt({ inputTokens: 0, outputTokens: 0 }), error: 'ADMISSION_DISABLED' }],
            null,
          ),
          // Held with unknown charge: no sample.
          row([attempt(null)], null),
        ],
      },
    });
    expect(samples).toEqual({ reasoning: [{ chargeMicros: 15_900n }] });
    const reasoning = sessionEstimate(CLAUDE_SONNET_5_5, samples).capabilities.find(
      (c) => c.capability === 'reasoning',
    );
    expect(reasoning).toMatchObject({ lowMicros: 5n * 15_900n, highMicros: 5n * 15_900n });
  });
});
