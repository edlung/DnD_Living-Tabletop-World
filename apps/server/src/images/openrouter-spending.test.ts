import { beforeEach, describe, expect, it } from 'vitest';

import { RecordingImageLedger } from '../testing/fake-image-ledger.ts';
import { jsonResponse, type FetchCall } from '../testing/fake-fetch.ts';
import {
  JOB,
  answer,
  brief,
  dataUrl,
  failureOf,
  picture,
  providerGenerator,
} from '../testing/image-provider.ts';
import type { ImageLedger } from './ledger.ts';

/**
 * Spending of the `openrouter-openai` generator (docs/adr/0035-images.md §2), with OpenRouter
 * stubbed at the HTTP boundary and a recording ledger: the model's worst case is reserved before
 * the call, the call is made only when admitted, and the reservation settles to the reported cost,
 * stays whole when none is reported, and is released only when nothing was sent. The ledger on
 * PostgreSQL: `ledger.integration.test.ts`.
 */
let lines: string[];
let ledger: RecordingImageLedger;

beforeEach(() => {
  lines = [];
  ledger = new RecordingImageLedger();
});

const generatorWith = (respond: (call: FetchCall) => Response | Promise<Response>) =>
  providerGenerator(respond, { ledger, lines });

/** Real images: generous under a loaded machine (the unit default is 5 s). */
const SLOW_MS = 30_000;

describe('spending', { timeout: SLOW_MS }, () => {
  it('reserves the model’s worst case before the call and settles to the reported cost', async () => {
    const png = await picture(64, 64);
    const { generator, calls } = generatorWith(() => {
      expect(ledger.reserved).toHaveLength(1);
      return jsonResponse(answer(dataUrl(png)));
    });
    await generator.generate(brief(), undefined, JOB);
    expect(calls).toHaveLength(1);
    expect(ledger.reserved).toEqual([
      {
        chargeId: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
        campaignId: 'ravenford',
        requestId: JOB.requestId,
        provider: 'openrouter-openai',
        model: 'openai/gpt-5.4-image-2',
        reserveMicros: 500_000n,
      },
    ]);
    expect(ledger.settled).toEqual([
      {
        chargeId: ledger.reserved[0]?.chargeId,
        settlement: {
          outcome: 'generated',
          costMicros: 41_200n,
          returnedModel: 'openai/gpt-5.4-image-2',
          providerRequestId: 'gen-1760000000-abc',
        },
      },
    ]);
  });

  it('makes no call without a budget, at the ceiling, or without the ledger', async () => {
    for (const denied of ['no-budget', 'ceiling', 'throw'] as const) {
      ledger = new RecordingImageLedger();
      ledger.answer = denied;
      const { generator, calls } = generatorWith(() => jsonResponse(answer(null)));
      expect(await failureOf(generator.generate(brief(), undefined, JOB)), denied).toBe(
        'UNAVAILABLE',
      );
      expect(calls, denied).toHaveLength(0);
      expect(ledger.settled, denied).toHaveLength(0);
    }
  });

  it('records a cost above the reservation as reported, with a warning', async () => {
    const png = await picture(64, 64);
    const { generator } = generatorWith(() =>
      jsonResponse(answer(dataUrl(png), { usage: { cost: 0.75 } })),
    );
    await generator.generate(brief(), undefined, JOB);
    expect(ledger.settled[0]?.settlement.costMicros).toBe(750_000n);
    expect(lines.join('')).toContain('image call cost more than its reservation');
    expect(lines.join('')).not.toContain('750');
  });

  it('keeps the reservation whole when the cost is not reported, and an unsettled image', async () => {
    const png = await picture(64, 64);
    const { generator } = generatorWith(() =>
      jsonResponse(answer(dataUrl(png), { usage: { prompt_tokens: 1 } })),
    );
    await generator.generate(brief(), undefined, JOB);
    expect(ledger.settled[0]?.settlement).toMatchObject({ outcome: 'generated', costMicros: null });

    // A paid image stays an image even when its charge cannot be settled.
    ledger = new RecordingImageLedger();
    ledger.failSettle = true;
    const failing = generatorWith(() => jsonResponse(answer(dataUrl(png))));
    expect((await failing.generator.generate(brief(), undefined, JOB)).mediaType).toBe(
      'image/webp',
    );
    expect(lines.join('')).toContain('image charge not settled');
  });

  it('reserves nothing and makes no call when the caller has already gone', async () => {
    const { generator, calls } = generatorWith(() => jsonResponse(answer(null)));
    const gone = AbortSignal.abort();
    expect(await failureOf(generator.generate(brief(), gone, JOB))).toBe('TIMEOUT');
    expect(calls).toHaveLength(0);
    expect(ledger.reserved).toHaveLength(0);
  });

  it('releases a reservation when the caller goes away before the call is sent', async () => {
    const controller = new AbortController();
    const recording = ledger;
    // The caller goes away while the reservation is being made.
    const aborting: ImageLedger = {
      reserve: async (charge) => {
        const result = await recording.reserve(charge);
        controller.abort();
        return result;
      },
      settle: (chargeId, settlement) => recording.settle(chargeId, settlement),
    };
    const { generator, calls } = providerGenerator(() => jsonResponse(answer(null)), {
      ledger: aborting,
      lines,
    });
    expect(await failureOf(generator.generate(brief(), controller.signal, JOB))).toBe('TIMEOUT');
    expect(calls).toHaveLength(0);
    expect(recording.settled).toEqual([
      {
        chargeId: recording.reserved[0]?.chargeId,
        settlement: {
          outcome: 'not-sent',
          costMicros: null,
          returnedModel: null,
          providerRequestId: null,
        },
      },
    ]);
  });
});
