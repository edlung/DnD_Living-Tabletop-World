import {
  assetIdFor,
  checkWorldIntegrity,
  entityPresentationAt,
  holderPerspective,
  replay,
  writtenEarlier,
} from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { blockersOf, stepOf, undo } from './testing/chronicle.ts';
import {
  eventFromRow,
  historicalWorld,
  loadHistory,
  type HistoryFixture,
} from './testing/history.ts';
import { CAMPAIGN, codeOf } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Asset purposes (docs/adr/0035-images.md §4) against the asset lineage the revision before them
 * wrote (revision 5da1b05, fixtures/history/5da1b05-asset-lineage.json): every asset event type,
 * none with a purpose. Adding purposes kept every type's version, so the current reader reads
 * them as `image`, re-decides the requests it wrote (an authoring commit's included) to the same
 * events, shows the same pictures, and continues the lineage with a figure.
 */
const fixture: HistoryFixture = await loadHistory('5da1b05-asset-lineage');
const step = stepOf(fixture);
const MIRA = 'mira-vale';
const WORKER = { actorId: 'asset-worker', kind: 'system' } as const;
const request = (name: string) => `${step(name)}#0`;

describe('the asset lineage written before purposes', () => {
  it('parses and replays every prefix, every picture an image, only its approvals an earlier version', () => {
    const events = fixture.events.map(eventFromRow);
    expect(events).toHaveLength(fixture.stream.version);
    const assetEvents = events.filter((event) => event.type.startsWith('Asset'));
    expect(new Set(assetEvents.map((event) => event.type))).toEqual(
      new Set([
        'AssetRequested',
        'AssetJobStarted',
        'AssetGenerated',
        'AssetJobFailed',
        'AssetRequestCancelled',
        'AssetRetracted',
        'AssetApproved',
      ]),
    );
    // Purposes kept every type's version; approvals since supersede their kind (version 3, ADR 0035
    // amendment), so this writer's approvals are an earlier writer's, canon as recorded.
    expect(new Set(events.filter(writtenEarlier).map((event) => event.type))).toEqual(
      new Set(['AssetApproved']),
    );
    for (const event of assetEvents) expect(event.payload).not.toHaveProperty('purpose');
    for (const row of fixture.commands) {
      expect(checkWorldIntegrity(replay(events.slice(0, row.last_sequence)))).toEqual([]);
    }
    const { requests, jobs, assets } = replay(events).assets;
    for (const record of [...requests.values(), ...jobs.values(), ...assets.values()]) {
      expect(record.purpose).toBe('image');
    }
    expect(assets.get(assetIdFor(request('request-mira-smiling')))?.status).toBe('CANDIDATE');
    expect(assets.get(assetIdFor(request('request-square')))?.status).toBe('DISCARDED');
  });

  it('re-decides every request it wrote to the same events, and verifies', async () => {
    await verifyHistory(await historicalWorld(fixture));
  });

  it('shows the same pictures, with no figure or battle map', async () => {
    const world = await historicalWorld(fixture);
    const snapshot = await world.engine.load(CAMPAIGN);
    if (!snapshot) throw new Error('missing campaign');
    const elowen = holderPerspective(snapshot.state, {
      kind: 'CHARACTER',
      characterId: 'elowen-starwhisper',
    });
    const mira = entityPresentationAt(snapshot, elowen, MIRA, null)?.presentation;
    const replacement = snapshot.state.assets.assets.get(assetIdFor(request('request-mira-again')));
    expect(replacement?.status).toBe('CANONICAL');
    expect(mira).toMatchObject({
      image: { variant: 'reference', purpose: 'image', contentHash: replacement?.contentHash },
      figure: null,
      battleMap: null,
    });
    // The undone approval left the DM-only variant a candidate: shown to no one.
    const dmView = entityPresentationAt(
      snapshot,
      { label: 'DM', kind: 'DM', holderId: null, scopes: 'ALL' },
      MIRA,
      null,
    )?.presentation;
    const smiling = snapshot.state.assets.assets.get(assetIdFor(request('request-mira-smiling')));
    expect(JSON.stringify(dmView)).not.toContain(smiling?.contentHash ?? 'none');
  });

  it('continues with a figure the current writer adds, and keeps its undo rules', async () => {
    const world = await historicalWorld(fixture);
    const requested = await world.dm({
      type: 'RequestAsset',
      entityId: MIRA,
      variant: 'derived',
      label: 'figure',
      purpose: 'figure',
    });
    if (requested.status !== 'accepted') throw new Error('figure request rejected');
    const figure = `${requested.commandId}#0`;
    for (const command of [
      { type: 'StartAssetJob', requestId: figure },
      {
        type: 'CompleteAssetJob',
        requestId: figure,
        contentHash: `sha256:${'f'.repeat(64)}`,
        mediaType: 'image/webp',
        generator: { provider: 'openrouter-openai', model: 'openai/gpt-5.4-image-2' },
      },
    ]) {
      expect(codeOf(await world.submit(command, WORKER))).toBe('accepted');
    }
    const approval = await world.dm({ type: 'ApproveAsset', assetId: assetIdFor(figure) });
    expect(codeOf(approval)).toBe('accepted');
    const state = await world.state();
    expect(state.assets.assets.get(assetIdFor(figure))).toMatchObject({
      purpose: 'figure',
      status: 'APPROVED',
      derivedFrom: assetIdFor(request('request-mira-again')),
    });

    // The figure derives from the old writer's approved reference: that approval now stands.
    const refused = await undo(world, step('approve-mira-again'));
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(blockersOf(refused)).toContain(requested.commandId);
    // The old writer's standing images still hold the commands that requested them.
    const held = await undo(world, step('author-tomas'));
    expect(codeOf(held)).toBe('UNDO_UNSAFE');
    expect(blockersOf(held)).toContain(step('approve-tomas'));
    // The new approval comes off; the figure is a candidate again.
    expect(
      codeOf(await undo(world, approval.status === 'accepted' ? approval.commandId : '')),
    ).toBe('accepted');
    expect((await world.state()).assets.assets.get(assetIdFor(figure))?.status).toBe('CANDIDATE');
    await verifyHistory(world);
  });
});
