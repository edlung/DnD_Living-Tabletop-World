import { ImageGenerationError, type ImageGenerator } from '@ltw/ai';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { RAVENFORD_RU_FIXTURES_DIR } from '../../world-engine/ravenford-seed.ts';
import { smokeHarness, type SmokeHarness } from './harness.ts';
import { EXIT, runImageSmoke } from './run.ts';

/**
 * The live image smoke against the production HTTP app (in memory, `harness.ts`): the whole path
 * with the placeholder generator, a paid generator's ledger record, and every refusal and failure
 * it must report rather than pass.
 */
const lineage = async (harness: SmokeHarness) =>
  (await harness.engine.load('ravenford'))?.state.assets ?? null;

/** Tomas's ID: the server's or the smoke's opaque one, never "tomas-reed" (ADR 0008, Gate 06). */
const tomasId = async (harness: SmokeHarness) => {
  const entities = [...((await harness.engine.load('ravenford'))?.state.entities.values() ?? [])];
  const id =
    entities.find((entity) => entity.name === 'Tomas Reed' || entity.name === 'Томас Рид')
      ?.entityId ?? '';
  expect(id).not.toMatch(/tomas|reed/);
  return id;
};

const tomasRequests = async (harness: SmokeHarness) => {
  const id = await tomasId(harness);
  return [...((await lineage(harness))?.requests.values() ?? [])].filter(
    (request) => request.entityId === id,
  );
};

const output = (harness: SmokeHarness) => harness.lines.join('\n');

const PAID = ['--generator', 'openrouter-openai'];
const CEILING = {
  revision: 1,
  ceilingMicros: '5000000',
  spentMicros: '0',
  heldMicros: '0',
  remainingMicros: '5000000',
  charges: 0,
  unsettled: 0,
};

/** Stands in for `openrouter-openai`: a WebP, and the ledger record the real one would leave. */
async function paidGenerator(sink: { harness?: SmokeHarness }): Promise<ImageGenerator> {
  const webp = await sharp({
    create: { width: 16, height: 16, channels: 3, background: '#806040' },
  })
    .webp()
    .toBuffer();
  return {
    id: 'openrouter-openai',
    generate: (_brief, _signal, job) => {
      const { harness } = sink;
      if (job && harness) {
        harness.charges.set(job.requestId, [
          {
            chargeId: '0f3c9a2e-5b1d-4e8f-9b06-7c4d2e1a8f53',
            provider: 'openrouter-openai',
            model: 'openai/gpt-5.4-image-2',
            reservedMicros: '500000',
            createdAt: '2026-10-16T10:00:00.000Z',
            settlement: {
              outcome: 'generated',
              chargedMicros: '41200',
              costReported: true,
              returnedModel: 'openai/gpt-5.4-image-2',
              providerRequestId: 'gen-1',
              settledAt: '2026-10-16T10:00:30.000Z',
              authorization: null,
            },
          },
        ]);
        harness.budget = {
          ...CEILING,
          spentMicros: '41200',
          remainingMicros: '4958800',
          charges: 1,
        };
      }
      return Promise.resolve({
        bytes: new Uint8Array(webp),
        mediaType: 'image/webp',
        model: 'openai/gpt-5.4-image-2',
      });
    },
  };
}

describe('the image smoke', () => {
  it('authors Tomas, follows the portrait his commit queued, and shows it only after approval', async () => {
    const harness = await smokeHarness();
    expect(await runImageSmoke(harness.context())).toBe(EXIT.passed);

    const text = output(harness);
    expect(text).toContain('image smoke PASSED');
    expect(text).toContain('moved elowen-starwhisper to the North Gate');
    // The seeded campaign's "Session 1" is open: no AI request at all.
    expect(text).toContain('no AI request is sent');
    expect(harness.traces.all()).toEqual([]);
    expect(text).toContain('queued by the authoring commit');
    expect(text).toContain('no reservation: the placeholder makes no provider call');
    expect(text).toContain('before approval: Tomas shows no picture');
    expect(text).toContain('after approval: Tomas and the North Gate scene show the portrait');
    // One request only: the commit's own; no duplicate, paid or not.
    const requests = await tomasRequests(harness);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      variant: 'reference',
      purpose: 'image',
      audience: 'players',
      source: { kind: 'authoring' },
    });
    const state = await harness.engine.load('ravenford');
    const tomas = await tomasId(harness);
    expect(state?.state.entities.get(tomas)).toMatchObject({
      kind: 'npc',
      name: 'Tomas Reed',
      description: 'A young guard of the Ravenford Guard, 22 years old.',
    });
    const assets = state?.state.assets;
    const canonical = assets?.canonical.get(tomas);
    expect(canonical && assets?.assets.get(canonical)?.status).toBe('CANONICAL');
  });

  it("sends the DM's sentence to the server's local provider when no play session is open", async () => {
    const harness = await smokeHarness();
    expect(await harness.dm({ type: 'EndSession', sessionId: 'ravenford-s1' })).toMatchObject({
      status: 'accepted',
    });
    expect(await runImageSmoke(harness.context())).toBe(EXIT.passed);
    expect(output(harness)).toContain('the DM intent was answered by the local provider only');
    const traces = harness.traces.all();
    expect(traces.map((trace) => trace.attempts.map((attempt) => attempt.provider))).toEqual([
      ['local'],
    ]);
    expect(traces[0]?.input).toBe('Add a young guard near North Gate who saw the caravan leave.');
    expect(await tomasRequests(harness)).toHaveLength(1);
  });

  it('requests a new portrait itself when Tomas already exists', async () => {
    const harness = await smokeHarness();
    expect(await runImageSmoke(harness.context())).toBe(EXIT.passed);
    harness.lines.length = 0;
    expect(await runImageSmoke(harness.context())).toBe(EXIT.passed);

    const text = output(harness);
    expect(text).toContain('queued by the RequestAsset');
    expect(text).toContain('Tomas shows his earlier picture');
    expect(text).not.toContain('[author]');
    const requests = await tomasRequests(harness);
    expect(requests.map((request) => request.source.kind)).toEqual(['authoring', 'dm']);
    const tomas = await tomasId(harness);
    const statuses = [...((await lineage(harness))?.assets.values() ?? [])]
      .filter((asset) => asset.entityId === tomas)
      .map((asset) => asset.status);
    expect(statuses).toEqual(['SUPERSEDED', 'CANONICAL']);
  });

  it('authors Tomas in a Russian campaign from the Russian sentence', async () => {
    const harness = await smokeHarness({ fixturesDir: RAVENFORD_RU_FIXTURES_DIR });
    expect(await runImageSmoke(harness.context())).toBe(EXIT.passed);
    expect(output(harness)).toContain('campaign ravenford (ru)');
    const tomas = await tomasId(harness);
    expect((await harness.engine.load('ravenford'))?.state.entities.get(tomas)).toMatchObject({
      name: 'Томас Рид',
      description: 'Молодой стражник Равенфордской стражи, двадцати двух лет.',
    });
  });

  it('records a paid generator’s picture and its settled reservation', async () => {
    const sink: { harness?: SmokeHarness } = {};
    const harness = await smokeHarness({ generator: await paidGenerator(sink) });
    sink.harness = harness;
    harness.budget = CEILING;
    expect(await runImageSmoke(harness.context(PAID))).toBe(EXIT.passed);
    const text = output(harness);
    expect(text).toContain('image/webp');
    expect(text).toContain(
      'reserved $0.500000 for openai/gpt-5.4-image-2 (0f3c9a2e-5b1d-4e8f-9b06-7c4d2e1a8f53); ' +
        'settled generated at $0.041200 (cost reported by the provider, generation gen-1)',
    );
    expect(text).toContain('spending   $0.041200 during the smoke');
  });

  it('fails a paid run whose job left no ledger record, and approves nothing', async () => {
    const harness = await smokeHarness({ generator: await paidGenerator({}) });
    harness.budget = CEILING;
    expect(await runImageSmoke(harness.context(PAID))).toBe(EXIT.failed);
    expect(output(harness)).toContain('no reservation for the job in the ledger the smoke reads');
    const assets = [...((await lineage(harness))?.assets.values() ?? [])];
    expect(assets.map((asset) => asset.status)).toEqual(['CANDIDATE']);
  });
});

describe('the image smoke refuses', () => {
  it('a paid run without a stored ceiling, before anything is written', async () => {
    const harness = await smokeHarness();
    expect(await runImageSmoke(harness.context(PAID))).toBe(EXIT.refused);
    expect(output(harness)).toContain('no image ceiling is stored');
    expect(await tomasRequests(harness)).toEqual([]);
    expect(harness.traces.all()).toEqual([]);
  });

  it('while other asset work is pending', async () => {
    const harness = await smokeHarness();
    await harness.dm({ type: 'RequestAsset', entityId: 'mira-vale', variant: 'reference' });
    expect(await runImageSmoke(harness.context())).toBe(EXIT.refused);
    expect(output(harness)).toMatch(/other asset work is pending.*mira-vale, QUEUED/);
    expect(harness.traces.all()).toEqual([]);
  });
});

describe('the image smoke fails', () => {
  it('on a failed job, and approves nothing', async () => {
    const failing: ImageGenerator = {
      id: 'placeholder',
      generate: () => Promise.reject(new ImageGenerationError('UNAVAILABLE', 'no budget')),
    };
    const harness = await smokeHarness({ generator: failing });
    expect(await runImageSmoke(harness.context())).toBe(EXIT.failed);
    expect(output(harness)).toMatch(/the job FAILED \(UNAVAILABLE\)/);
    expect(output(harness)).toContain('ledger     no reservation for this request');
    expect((await lineage(harness))?.canonical.has(await tomasId(harness))).toBe(false);
  });

  it('on a paid call the provider refused, and still accounts for its reservation', async () => {
    const sink: { harness?: SmokeHarness } = {};
    const refusing: ImageGenerator = {
      id: 'openrouter-openai',
      generate: (_brief, _signal, job) => {
        sink.harness?.charges.set(job?.requestId ?? '', [
          {
            chargeId: '0f3c9a2e-5b1d-4e8f-9b06-7c4d2e1a8f54',
            provider: 'openrouter-openai',
            model: 'openai/gpt-5.4-image-2',
            reservedMicros: '500000',
            createdAt: '2026-10-16T10:00:00.000Z',
            settlement: {
              outcome: 'refused',
              chargedMicros: '500000',
              costReported: false,
              returnedModel: null,
              providerRequestId: null,
              settledAt: '2026-10-16T10:00:20.000Z',
              authorization: null,
            },
          },
        ]);
        return Promise.reject(new ImageGenerationError('REFUSED', 'refused'));
      },
    };
    const harness = await smokeHarness({ generator: refusing });
    sink.harness = harness;
    harness.budget = CEILING;
    expect(await runImageSmoke(harness.context(PAID))).toBe(EXIT.failed);
    expect(output(harness)).toMatch(/the job FAILED \(REFUSED\)/);
    expect(output(harness)).toContain(
      'settled refused at $0.500000 (no cost reported: the whole reservation)',
    );
  });

  it('after the bounded wait when no worker runs the job', async () => {
    const harness = await smokeHarness();
    harness.workerRuns = false;
    const context = harness.context(['--generator', 'placeholder', '--timeout-seconds', '10']);
    expect(await runImageSmoke(context)).toBe(EXIT.failed);
    expect(output(harness)).toContain('the job is still QUEUED after 10 s');
  });

  it('when the picture came from another generator than expected', async () => {
    const harness = await smokeHarness();
    harness.budget = CEILING;
    expect(await runImageSmoke(harness.context(PAID))).toBe(EXIT.failed);
    expect(output(harness)).toContain(
      'the picture came from local/placeholder-svg-1, not the openrouter-openai generator',
    );
  });

  it('when it reads another database than the server’s', async () => {
    const harness = await smokeHarness();
    harness.sameDatabase = false;
    expect(await runImageSmoke(harness.context())).toBe(EXIT.failed);
    expect(output(harness)).toContain("DATABASE_URL is not the server's");
  });
});
