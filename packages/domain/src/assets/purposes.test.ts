import { describe, expect, it } from 'vitest';

import { DM } from '../authoring/testing/world.ts';
import { parseRecordedEvent, type RecordedEvent } from '../kernel/events.ts';
import { replay } from '../kernel/evolve.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { assetIdFor } from './records.ts';
import { WORKER, assetWorld, codeOf, hash } from './testing/world.ts';
import { assetLineage, entityAssetsFor } from './views.ts';

/**
 * Asset purposes (docs/adr/0035-images.md §4): an `image` (the default, chosen by state tags), a
 * character's `figure`, and a place's `battle-map`. A figure and a battle map are derived variants
 * of the canonical reference; lineage, approval, visibility and the undo hold are unchanged.
 */
const MIRA = 'mira-vale';
const ELOWEN = 'elowen-starwhisper';
const ROAD = 'old-trade-road';
const WHEEL = 'item-f44e7183';

const figure = { variant: 'derived', label: 'figure', purpose: 'figure' } as const;
const figure_ = (label: string) => ({ variant: 'derived', label, purpose: 'figure' }) as const;
const battleMap = { variant: 'derived', label: 'map', purpose: 'battle-map' } as const;

describe('a figure and a battle map', () => {
  it('are derived variants that keep their purpose through job, asset, approval and replay', async () => {
    const world = await assetWorld();
    const reference = await world.approved(MIRA, 1);
    const requestId = await world.request(MIRA, figure);
    expect((await world.state()).assets.requests.get(requestId)).toMatchObject({
      variant: 'derived',
      purpose: 'figure',
      derivedFrom: reference,
    });
    expect(codeOf(await world.start(requestId))).toBe('accepted');
    expect((await world.state()).assets.jobs.get(requestId)?.purpose).toBe('figure');
    expect(codeOf(await world.complete(requestId, 2))).toBe('accepted');
    const assetId = assetIdFor(requestId);
    expect((await world.state()).assets.assets.get(assetId)).toMatchObject({
      purpose: 'figure',
      status: 'CANDIDATE',
      version: 1,
    });
    expect(codeOf(await world.approve(assetId))).toBe('accepted');
    const state = await world.state();
    expect(state.assets.assets.get(assetId)?.status).toBe('APPROVED');
    // Approving a figure never touches the canonical reference.
    expect(state.assets.canonical.get(MIRA)).toBe(reference);

    const map = await world.approved(ROAD, 3, { variant: 'reference' });
    const mapRequest = await world.request(ROAD, battleMap);
    await world.start(mapRequest);
    await world.complete(mapRequest, 4);
    await world.approve(assetIdFor(mapRequest));
    expect((await world.state()).assets.assets.get(assetIdFor(mapRequest))).toMatchObject({
      purpose: 'battle-map',
      derivedFrom: map,
      status: 'APPROVED',
    });
    await world.verified();
  });

  it('are refused as a reference, for the wrong kind, or without a canonical reference', async () => {
    const world = await assetWorld();
    const refused = async (entityId: string, command: Record<string, unknown>) =>
      codeOf(await world.as(DM, { type: 'RequestAsset', entityId, ...command }));
    // Without a canonical reference there is nothing to derive from.
    expect(await refused(MIRA, figure)).toBe('INVALID_ASSET');
    await world.approved(MIRA, 1);
    await world.approved(ROAD, 2);
    await world.approved(WHEEL, 3);
    expect(await refused(MIRA, { variant: 'reference', purpose: 'figure' })).toBe('INVALID_ASSET');
    expect(await refused(ROAD, figure)).toBe('INVALID_ASSET');
    expect(await refused(MIRA, battleMap)).toBe('INVALID_ASSET');
    expect(await refused(WHEEL, figure)).toBe('INVALID_ASSET');
    expect(await refused(WHEEL, battleMap)).toBe('INVALID_ASSET');
    expect(await refused(MIRA, { ...figure, purpose: 'portrait' })).toBe('INVALID_COMMAND');
    // An image stays any kind's, a reference or a variant.
    expect(await refused(WHEEL, { variant: 'derived', label: 'night', purpose: 'image' })).toBe(
      'accepted',
    );
    await world.verified();
  });

  it('write an image exactly as before purposes existed, and only another purpose by name', async () => {
    const world = await assetWorld();
    await world.approved(MIRA, 1);
    const plain = await world.request(MIRA, { variant: 'derived', label: 'night' });
    const named = await world.request(MIRA, {
      variant: 'derived',
      label: 'rain',
      purpose: 'image',
    });
    const figured = await world.request(MIRA, figure);
    for (const requestId of [plain, named, figured]) {
      await world.start(requestId);
      await world.complete(requestId, requestId === figured ? 3 : requestId === plain ? 1 : 2);
    }
    const history = (await world.engine.load('ravenford'))?.history ?? [];
    const payloads = (requestId: string) =>
      history
        .filter(
          (event) =>
            (event.type === 'AssetRequested' ||
              event.type === 'AssetJobStarted' ||
              event.type === 'AssetGenerated') &&
            event.payload.requestId === requestId,
        )
        .map((event) => event.payload as Record<string, unknown>);
    for (const requestId of [plain, named]) {
      expect(payloads(requestId)).toHaveLength(3);
      for (const payload of payloads(requestId)) expect(payload).not.toHaveProperty('purpose');
    }
    expect(payloads(figured).map((payload) => payload['purpose'])).toEqual([
      'figure',
      'figure',
      'figure',
    ]);
    await world.verified();
  });

  it('count versions per purpose: a wounded figure is not the next wounded image', async () => {
    const world = await assetWorld();
    await world.approved(ELOWEN, 1);
    const image = await world.approved(ELOWEN, 2, { variant: 'derived', label: 'wounded' });
    const woundedFigure = await world.approved(ELOWEN, 3, figure_('wounded'));
    const again = await world.approved(ELOWEN, 4, { variant: 'derived', label: 'wounded' });
    const { assets } = (await world.state()).assets;
    expect([image, woundedFigure, again].map((id) => assets.get(id)?.version)).toEqual([1, 1, 2]);
    await world.verified();
  });

  it('read a request written before purposes existed as an image', () => {
    const COMMAND: Record<string, string> = {
      CampaignCreated: 'CreateCampaign',
      EntityCreated: 'CreateEntity',
      AssetRequested: 'RequestAsset',
    };
    const recorded = (sequence: number, type: string, payload: unknown): RecordedEvent =>
      parseRecordedEvent({
        campaignId: 'old',
        sequence,
        eventId: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
        schemaVersion: 2,
        worldTime: 0,
        recordedAt: '2026-10-04T00:00:00.000Z',
        causation: { commandId: `old.${String(sequence)}`, commandType: COMMAND[type], actor: DM },
        type,
        payload,
      });
    const state = replay([
      recorded(1, 'CampaignCreated', {
        campaignId: 'old',
        name: 'Old',
        worldName: 'Old',
        startsAt: 0,
        dmActorId: DM.actorId,
      }),
      recorded(2, 'EntityCreated', {
        entityId: MIRA,
        kind: 'npc',
        name: 'Mira',
        description: '',
        existsSince: null,
        location: null,
      }),
      recorded(3, 'AssetRequested', {
        requestId: 'old.3#0',
        entityId: MIRA,
        variant: 'reference',
        label: null,
        audience: 'players',
        note: null,
        derivedFrom: null,
        source: { kind: 'dm' },
      }),
    ]);
    expect(state.assets.requests.get('old.3#0')?.purpose).toBe('image');
  });

  it('keep the undo hold and restore a figure’s candidate on an undone approval', async () => {
    const world = await assetWorld();
    await world.approved(MIRA, 1);
    const requestId = await world.request(MIRA, figure);
    await world.start(requestId);
    // A running figure job holds its request like any other.
    const commandOfRequest = requestId.slice(0, -2);
    expect(codeOf(await world.undo(commandOfRequest))).toBe('UNDO_UNSAFE');
    await world.complete(requestId, 2);
    const approval = await world.approve(assetIdFor(requestId));
    if (approval.status !== 'accepted') throw new Error('approval rejected');
    expect(codeOf(await world.undo(approval.commandId))).toBe('accepted');
    expect((await world.state()).assets.assets.get(assetIdFor(requestId))).toMatchObject({
      purpose: 'figure',
      status: 'CANDIDATE',
    });
    await world.verified();
  });

  it('are shown to players as their purpose only after approval, and the DM lineage names it', async () => {
    const world = await assetWorld();
    await world.approved(ELOWEN, 1);
    const requestId = await world.request(ELOWEN, figure);
    await world.start(requestId);
    await world.complete(requestId, 2);
    const elowen = holderPerspective(await world.state(), {
      kind: 'CHARACTER',
      characterId: ELOWEN,
    });
    expect(
      entityAssetsFor(await world.state(), elowen, ELOWEN)?.map((asset) => asset.contentHash),
    ).toEqual([hash(1)]);
    await world.approve(assetIdFor(requestId));
    expect(entityAssetsFor(await world.state(), elowen, ELOWEN)).toEqual([
      {
        variant: 'reference',
        purpose: 'image',
        version: 1,
        contentHash: hash(1),
        mediaType: 'image/svg+xml',
      },
      {
        variant: 'derived',
        purpose: 'figure',
        version: 1,
        contentHash: hash(2),
        mediaType: 'image/svg+xml',
      },
    ]);
    const lineage = assetLineage(await world.state());
    expect(lineage.requests.find((request) => request.requestId === requestId)).toMatchObject({
      purpose: 'figure',
      status: 'COMPLETED',
    });
    expect(lineage.assets.map((asset) => asset.purpose)).toEqual(['image', 'figure']);
    expect(codeOf(await world.as(WORKER, { type: 'StartAssetJob', requestId }))).toBe(
      'INVALID_ASSET',
    );
  });
});
