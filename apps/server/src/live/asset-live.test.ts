import { createPlaceholderImageGenerator } from '@ltw/ai';
import type { AssetLineageResponse } from '@ltw/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { InMemoryAssetContentStore } from '../assets/content-store.ts';
import { AssetWorker } from '../assets/worker.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { delivered, liveRavenford, readyLive, type LiveStream } from '../testing/live.ts';
import { TOKENS, get, post } from '../testing/ravenford-app.ts';

/**
 * Image work and the live signal (docs/STAGE_330_DESIGN.md "DM controls"; Stage 330 part B): the
 * asset lineage is in the DM perspective's coverage, so the DM's image controls follow a job
 * from the request to a candidate as the asset worker reports it. A player hears of none of it
 * until the DM approves a picture of something the player sees, and its stream carries no hash.
 */
const apps: { close(): Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const changes = (stream: LiveStream) =>
  stream.messages().filter((message) => message.type === 'changed').length;
const live = (perspective: string, place?: string) =>
  `/campaigns/ravenford/live?perspective=${encodeURIComponent(perspective)}${place ? `&place=${place}` : ''}`;

describe('image work and the live signal', () => {
  it('signals the DM at each step of a job and the player only when a seen picture is approved', async () => {
    const world = await liveRavenford({ limits: { perActor: 8 } });
    apps.push(world.app);
    const dm = await readyLive(world.app, live('DM'), TOKENS.dm);
    // The player looks at Market Square, where Mira stands.
    const player = await readyLive(world.app, live('PLAYER', 'market-square'), TOKENS.player);
    await world.hub.cycle();
    await delivered();
    const step = async () => {
      await world.hub.cycle();
      await delivered();
      return [changes(dm), changes(player)];
    };
    const [dmStart = 0, playerStart = 0] = await step();

    const requested = await post(
      world.app,
      '/campaigns/ravenford/commands',
      {
        commandId: 'portrait',
        command: { type: 'RequestAsset', entityId: 'mira-vale', variant: 'reference' },
      },
      TOKENS.dm,
    );
    expect(requested.json()).toMatchObject({ status: 'accepted' });
    expect(await step()).toEqual([dmStart + 1, playerStart]);

    // The worker makes a candidate: the DM's controls show it, the player hears nothing.
    const worker = new AssetWorker({
      engine: world.engine,
      contents: new InMemoryAssetContentStore(),
      generator: createPlaceholderImageGenerator(),
      timeoutMs: 5_000,
      logger: createLogger({ service: 'asset-live-test', level: 'silent' }),
    });
    expect(await worker.runOnce('ravenford')).toEqual({ started: 1, completed: 1, failed: 0 });
    expect(await step()).toEqual([dmStart + 2, playerStart]);

    const lineage = (
      await get(world.app, '/campaigns/ravenford/assets', TOKENS.dm)
    ).json<AssetLineageResponse>();
    const [candidate] = lineage.assets;
    expect(candidate?.status).toBe('CANDIDATE');
    const approved = await post(
      world.app,
      '/campaigns/ravenford/commands',
      { commandId: 'approve', command: { type: 'ApproveAsset', assetId: candidate?.assetId } },
      TOKENS.dm,
    );
    expect(approved.json()).toMatchObject({ status: 'accepted' });
    const [dmEnd = 0, playerEnd = 0] = await step();
    expect(dmEnd).toBe(dmStart + 3);
    expect(playerEnd).toBe(playerStart + 1);
    // The signal names nothing: no hash, no asset or request ID reaches the player's stream.
    const frames = player.frames().join('');
    expect(frames).not.toContain('sha256');
    expect(frames).not.toContain('portrait');
  });
});
