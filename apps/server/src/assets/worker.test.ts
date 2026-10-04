import {
  ImageGenerationError,
  createPlaceholderImageGenerator,
  type ImageBrief,
  type ImageGenerator,
} from '@ltw/ai';
import { assetIdFor, type WorldEngine } from '@ltw/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { createLogger } from '../platform/logging/logger.ts';
import { seededEngine } from '../testing/ravenford-app.ts';
import { InMemoryAssetContentStore, contentHashOf } from './content-store.ts';
import { AssetWorker, workerCommandId } from './worker.ts';

/**
 * The asset worker (docs/adr/0022-asset-identity.md §4) over a seeded
 * Ravenford: it starts queued requests, records what the generator did, and
 * stores the bytes. Every step is an idempotent command of the system actor.
 */
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const MIRA = 'mira-vale';

let engine: WorldEngine;
let contents: InMemoryAssetContentStore;
let lines: string[];
let counter = 0;

const logger = () =>
  createLogger({
    service: 'asset-worker-test',
    level: 'debug',
    destination: { write: (chunk: string) => lines.push(chunk) },
  });

const workerWith = (generator: ImageGenerator, timeoutMs = 1_000) =>
  new AssetWorker({ engine, contents, generator, timeoutMs, logger: logger() });

async function request(entityId = MIRA): Promise<string> {
  counter += 1;
  const result = await engine.execute({
    commandId: `worker-test.${String(counter)}`,
    campaignId: 'ravenford',
    actor: DM,
    command: { type: 'RequestAsset', entityId, variant: 'reference' },
  });
  if (result.status !== 'accepted') throw new Error('request rejected');
  return `${result.commandId}#0`;
}

const assets = async () => (await engine.load('ravenford'))?.state.assets;

beforeEach(async () => {
  engine = await seededEngine();
  contents = new InMemoryAssetContentStore();
  lines = [];
});

describe('the asset worker', () => {
  it('runs a queued request to a candidate image whose bytes it stores', async () => {
    const requestId = await request();
    const summary = await workerWith(createPlaceholderImageGenerator()).runOnce('ravenford');
    expect(summary).toEqual({ started: 1, completed: 1, failed: 0 });

    const state = await assets();
    const asset = state?.assets.get(assetIdFor(requestId));
    expect(asset).toMatchObject({
      status: 'CANDIDATE',
      mediaType: 'image/svg+xml',
      generator: { provider: 'local', model: 'placeholder-svg-1' },
    });
    const stored = await contents.get('ravenford', asset?.contentHash ?? '');
    expect(stored && contentHashOf(stored.bytes)).toBe(asset?.contentHash);
    expect(await contents.get('elsewhere', asset?.contentHash ?? '')).toBeNull();

    // Nothing left to do; the log names no entity, prompt, or name.
    expect(await workerWith(createPlaceholderImageGenerator()).runOnce('ravenford')).toEqual({
      started: 0,
      completed: 0,
      failed: 0,
    });
    expect(lines.join('')).not.toMatch(/Mira|mira-vale|Vale/);
  });

  it('issues each step as the system actor under a deterministic command ID', async () => {
    const requestId = await request();
    await workerWith(createPlaceholderImageGenerator()).runOnce('ravenford');
    const log = await engine.commandLog('ravenford');
    for (const [step, type] of [
      ['start', 'StartAssetJob'],
      ['complete', 'CompleteAssetJob'],
    ] as const) {
      expect(
        log.find((stored) => stored.commandId === workerCommandId(step, requestId)),
      ).toMatchObject({
        commandType: type,
        actor: { actorId: 'asset-worker', kind: 'system' },
      });
    }
    expect(workerCommandId('start', requestId)).toMatch(/^asset-worker\.start\.[0-9a-f]{40}$/);
  });

  it('records a failed or timed-out generation by its code, and never retries it', async () => {
    const refused = await request();
    await workerWith({
      id: 'refusing',
      generate: () => Promise.reject(new ImageGenerationError('REFUSED', 'no')),
    }).runOnce('ravenford');
    expect((await assets())?.jobs.get(refused)).toMatchObject({
      status: 'FAILED',
      failure: 'REFUSED',
    });

    const slow = await request();
    const summary = await workerWith(
      { id: 'slow', generate: () => new Promise(() => undefined) },
      20,
    ).runOnce('ravenford');
    expect(summary).toEqual({ started: 1, completed: 0, failed: 1 });
    expect((await assets())?.jobs.get(slow)).toMatchObject({
      status: 'FAILED',
      failure: 'TIMEOUT',
    });
    expect(contents.size).toBe(0);
  });

  it('records an image the DM cancelled while it was generated as discarded', async () => {
    const requestId = await request();
    const cancelling: ImageGenerator = {
      id: 'local',
      generate: async (brief: ImageBrief) => {
        await engine.execute({
          commandId: 'worker-test.cancel',
          campaignId: 'ravenford',
          actor: DM,
          command: { type: 'CancelAssetRequest', requestId: brief.seed },
        });
        return createPlaceholderImageGenerator().generate(brief);
      },
    };
    await workerWith(cancelling).runOnce('ravenford');
    const state = await assets();
    expect(state?.jobs.get(requestId)?.status).toBe('CANCELLED');
    expect(state?.assets.get(assetIdFor(requestId))?.status).toBe('DISCARDED');
  });

  it('finishes a job a crash left running, with the same command IDs', async () => {
    const requestId = await request();
    // Simulate a crash after the start: the job is recorded as started only.
    await engine.execute({
      commandId: workerCommandId('start', requestId),
      campaignId: 'ravenford',
      actor: { actorId: 'asset-worker', kind: 'system' },
      command: { type: 'StartAssetJob', requestId },
    });
    expect((await assets())?.jobs.get(requestId)?.status).toBe('STARTED');

    const summary = await workerWith(createPlaceholderImageGenerator()).runOnce('ravenford');
    expect(summary).toEqual({ started: 0, completed: 1, failed: 0 });
    expect((await assets())?.assets.get(assetIdFor(requestId))?.status).toBe('CANDIDATE');
  });

  it('tells the generator the entity and request, never another entity', async () => {
    const briefs: ImageBrief[] = [];
    await request();
    await workerWith({
      id: 'local',
      generate: (brief) => {
        briefs.push(brief);
        return createPlaceholderImageGenerator().generate(brief);
      },
    }).runOnce('ravenford');
    expect(briefs).toHaveLength(1);
    expect(briefs[0]).toMatchObject({
      subject: { kind: 'npc', name: 'Mira Vale' },
      variant: 'reference',
      basedOn: null,
    });
  });
});
