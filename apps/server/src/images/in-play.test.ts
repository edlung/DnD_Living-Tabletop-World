import { assetIdFor, type WorldEngine } from '@ltw/domain';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAssetContentStore } from '../assets/content-store.ts';
import { AssetWorker } from '../assets/worker.ts';
import { Secret } from '../platform/config/config.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { RecordingImageLedger } from '../testing/fake-image-ledger.ts';
import { fakeFetch, jsonResponse, type FetchCall } from '../testing/fake-fetch.ts';
import { seededEngine } from '../testing/ravenford-app.ts';
import { createOpenRouterImageGenerator } from './openrouter-generator.ts';
import { NO_STYLE_REFERENCES } from './style-references.ts';

/**
 * In-play generation through the asset worker (docs/adr/0035-images.md §1): the worker gives the
 * `openrouter-openai` generator the job and, for a derived variant, the stored bytes of the
 * approved canonical reference, which reach the provider as the input image; the result is a
 * WebP candidate recorded with its provider and model; a denied budget makes no call and fails
 * the job as `UNAVAILABLE`.
 */
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const MIRA = 'mira-vale';

let engine: WorldEngine;
let contents: InMemoryAssetContentStore;
let ledger: RecordingImageLedger;
let counter = 0;

beforeEach(async () => {
  engine = await seededEngine();
  contents = new InMemoryAssetContentStore();
  ledger = new RecordingImageLedger();
});

async function dm(command: Record<string, unknown>): Promise<string> {
  counter += 1;
  const result = await engine.execute({
    commandId: `in-play.${String(counter)}`,
    campaignId: 'ravenford',
    actor: DM,
    command,
  });
  if (result.status !== 'accepted') throw new Error(`${String(command['type'])} rejected`);
  return result.commandId;
}

function workerAnswering(png: Buffer) {
  const transport = fakeFetch(() =>
    jsonResponse({
      id: 'gen-1',
      model: 'openai/gpt-5.4-image-2',
      choices: [
        {
          finish_reason: 'stop',
          message: {
            images: [
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${png.toString('base64')}` },
              },
            ],
          },
        },
      ],
      usage: { cost: 0.05 },
    }),
  );
  const generator = createOpenRouterImageGenerator({
    apiKey: new Secret('sk-or-v1-TEST-ONLY-in-play'),
    model: 'openai/gpt-5.4-image-2',
    ledger,
    styleReferences: NO_STYLE_REFERENCES,
    timeoutMs: 5_000,
    logger: createLogger({ service: 'in-play-test', level: 'silent' }),
    fetch: transport.fetchImpl,
  });
  const worker = new AssetWorker({
    engine,
    contents,
    generator,
    timeoutMs: 5_000,
    logger: createLogger({ service: 'in-play-test', level: 'silent' }),
  });
  return { worker, calls: transport.calls };
}

const imagesSent = (call: FetchCall | undefined) =>
  (
    JSON.parse(call?.body ?? '{}') as {
      messages: [unknown, { content: { type: string; image_url?: { url: string } }[] }];
    }
  ).messages[1].content
    .filter((part) => part.type === 'image_url')
    .map((part) => part.image_url?.url);

/** Real images, seeds and imports: generous under a loaded machine (the unit default is 5 s). */
const SLOW_MS = 30_000;

describe('in-play generation through the asset worker', { timeout: SLOW_MS }, () => {
  it('records a WebP candidate and sends a derived variant its stored canonical reference', async () => {
    const png = await sharp({
      create: { width: 96, height: 96, channels: 3, background: '#7a5230' },
    })
      .png()
      .toBuffer();
    const { worker, calls } = workerAnswering(png);
    const reference = `${await dm({ type: 'RequestAsset', entityId: MIRA, variant: 'reference' })}#0`;
    expect(await worker.runOnce('ravenford')).toEqual({ started: 1, completed: 1, failed: 0 });
    const state = (await engine.load('ravenford'))?.state;
    const candidate = state?.assets.assets.get(assetIdFor(reference));
    expect(candidate).toMatchObject({
      status: 'CANDIDATE',
      mediaType: 'image/webp',
      generator: { provider: 'openrouter-openai', model: 'openai/gpt-5.4-image-2' },
    });
    const stored = await contents.get('ravenford', candidate?.contentHash ?? '');
    expect((await sharp(stored?.bytes).metadata()).format).toBe('webp');
    expect(ledger.reserved.map((charge) => charge.requestId)).toEqual([reference]);

    await dm({ type: 'ApproveAsset', assetId: assetIdFor(reference) });
    const figure = `${await dm({
      type: 'RequestAsset',
      entityId: MIRA,
      variant: 'derived',
      label: 'figure',
      purpose: 'figure',
    })}#0`;
    expect(await worker.runOnce('ravenford')).toEqual({ started: 1, completed: 1, failed: 0 });
    expect(imagesSent(calls[1])).toEqual([
      `data:image/webp;base64,${Buffer.from(stored?.bytes ?? []).toString('base64')}`,
    ]);
    expect(
      (await engine.load('ravenford'))?.state.assets.assets.get(assetIdFor(figure)),
    ).toMatchObject({
      purpose: 'figure',
      status: 'CANDIDATE',
    });
  });

  it('fails a job as UNAVAILABLE without a call when the budget denies it', async () => {
    ledger.answer = 'no-budget';
    const { worker, calls } = workerAnswering(Buffer.from([]));
    const requestId = `${await dm({ type: 'RequestAsset', entityId: MIRA, variant: 'reference' })}#0`;
    expect(await worker.runOnce('ravenford')).toEqual({ started: 1, completed: 0, failed: 1 });
    expect(calls).toHaveLength(0);
    expect((await engine.load('ravenford'))?.state.assets.jobs.get(requestId)).toMatchObject({
      status: 'FAILED',
      failure: 'UNAVAILABLE',
    });
    expect(contents.size).toBe(0);
  });
});
