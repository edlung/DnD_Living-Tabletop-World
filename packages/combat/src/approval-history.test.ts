import {
  assetIdFor,
  checkWorldIntegrity,
  entityPresentationAt,
  holderPerspective,
  replay,
  worldTimeAt,
  writtenEarlier,
  type RecordedEvent,
} from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { blockersOf, DM_PERSPECTIVE, stepOf, undo } from './testing/chronicle.ts';
import {
  eventFromRow,
  historicalWorld,
  loadHistory,
  type HistoryFixture,
} from './testing/history.ts';
import { CAMPAIGN, codeOf, type RoadWorld } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Approvals that supersede their kind (ADR 0035 amendment; `AssetApproved` version 3) against the
 * lineage the revision before them wrote (revision 80d06df,
 * fixtures/history/80d06df-approved-kinds.json): that writer approved an older `night` image,
 * figure and battle map after a newer one, which left two of each approved. Its approvals are
 * version 2: canon as recorded (both stay approved and show as that writer showed them), folded by
 * the re-decision oracle instead of re-decided under the new rule, and resting on everything
 * before them. The current writer's next approval of a kind supersedes every approved picture of
 * it, and its undo puts them all back.
 */
const fixture: HistoryFixture = await loadHistory('80d06df-approved-kinds');
const step = stepOf(fixture);
const asset = (name: string) => assetIdFor(`${step(name)}#0`);
const MIRA = 'mira-vale';
const ROAD = 'old-trade-road';
const NIGHT = worldTimeAt(1, 22);
const KINDS = ['mira-night', 'mira-figure', 'road-map'] as const;

async function shown(world: RoadWorld) {
  const snapshot = await world.engine.load(CAMPAIGN);
  if (!snapshot) throw new Error('missing campaign');
  const mira = entityPresentationAt(snapshot, DM_PERSPECTIVE, MIRA, null)?.presentation;
  const road = entityPresentationAt(snapshot, DM_PERSPECTIVE, ROAD, null)?.presentation;
  return {
    image: mira?.image?.contentHash,
    figure: mira?.figure?.contentHash,
    battleMap: road?.battleMap?.contentHash,
  };
}

const contentOf = async (world: RoadWorld, name: string) =>
  (await world.state()).assets.assets.get(asset(name))?.contentHash;

const approvalOf = async (world: RoadWorld, commandId: string) =>
  ((await world.engine.load(CAMPAIGN))?.history ?? []).find(
    (event): event is Extract<RecordedEvent, { type: 'AssetApproved' }> =>
      event.type === 'AssetApproved' && event.causation.commandId === commandId,
  );

describe('the approvals written before an approval superseded its kind', () => {
  it('parse and replay every prefix as an earlier version, leaving two of each kind approved', () => {
    const events = fixture.events.map(eventFromRow);
    expect(events).toHaveLength(fixture.stream.version);
    expect(new Set(events.filter(writtenEarlier).map((event) => event.type))).toEqual(
      new Set(['AssetApproved']),
    );
    for (const event of events) expect(event.payload).not.toHaveProperty('supersedes');
    for (const row of fixture.commands) {
      expect(checkWorldIntegrity(replay(events.slice(0, row.last_sequence)))).toEqual([]);
    }
    const { assets } = replay(events).assets;
    for (const kind of KINDS) {
      expect(
        [1, 2, 3].map((n) => assets.get(asset(`request-${kind}-${String(n)}`))?.status),
      ).toEqual(['APPROVED', 'APPROVED', 'CANDIDATE']);
    }
    // That writer's undone approval left its variant a candidate.
    expect(assets.get(asset('request-mira-rain'))?.status).toBe('CANDIDATE');
  });

  it('show what that writer showed: the newer of each kind, though the older was approved last', async () => {
    const world = await historicalWorld(fixture);
    expect(codeOf(await world.dm({ type: 'AdvanceWorldTime', to: NIGHT }))).toBe('accepted');
    expect(await shown(world)).toEqual({
      image: await contentOf(world, 'request-mira-night-2'),
      figure: await contentOf(world, 'request-mira-figure-2'),
      battleMap: await contentOf(world, 'request-road-map-2'),
    });
    const elowen = holderPerspective(await world.state(), {
      kind: 'CHARACTER',
      characterId: 'elowen-starwhisper',
    });
    const snapshot = await world.engine.load(CAMPAIGN);
    if (!snapshot) throw new Error('missing campaign');
    expect(
      entityPresentationAt(snapshot, elowen, MIRA, null)?.presentation.image?.contentHash,
    ).toBe(await contentOf(world, 'request-mira-night-2'));
  });

  it('re-decide what the current writer decides and fold those approvals as recorded', async () => {
    await verifyHistory(await historicalWorld(fixture));
  });

  it('are superseded together by the current writer’s next approval of their kind, and come back on its undo', async () => {
    const world = await historicalWorld(fixture);
    const approvals: Record<string, string> = {};
    for (const kind of KINDS) {
      const result = await world.dm({
        type: 'ApproveAsset',
        assetId: asset(`request-${kind}-3`),
      });
      if (result.status !== 'accepted') throw new Error(`approve ${kind}: ${codeOf(result)}`);
      approvals[kind] = result.commandId;
      expect(await approvalOf(world, result.commandId)).toMatchObject({
        schemaVersion: 3,
        payload: {
          assetId: asset(`request-${kind}-3`),
          previous: null,
          supersedes: [asset(`request-${kind}-1`), asset(`request-${kind}-2`)],
        },
      });
      const { assets } = (await world.state()).assets;
      expect(
        [1, 2, 3].map((n) => assets.get(asset(`request-${kind}-${String(n)}`))?.status),
      ).toEqual(['SUPERSEDED', 'SUPERSEDED', 'APPROVED']);
    }
    expect(codeOf(await world.dm({ type: 'AdvanceWorldTime', to: NIGHT }))).toBe('accepted');
    expect(await shown(world)).toEqual({
      image: await contentOf(world, 'request-mira-night-3'),
      figure: await contentOf(world, 'request-mira-figure-3'),
      battleMap: await contentOf(world, 'request-road-map-3'),
    });

    // Mira's figure approval came later and wrote what her pictures rest on: it comes off first.
    const night = await undo(world, approvals['mira-night'] ?? '');
    expect(blockersOf(night)).toEqual([approvals['mira-figure']]);
    for (const kind of ['mira-figure', 'mira-night'] as const) {
      expect(codeOf(await undo(world, approvals[kind] ?? '')), kind).toBe('accepted');
      const { assets } = (await world.state()).assets;
      expect(
        [1, 2, 3].map((n) => assets.get(asset(`request-${kind}-${String(n)}`))?.status),
      ).toEqual(['APPROVED', 'APPROVED', 'CANDIDATE']);
    }
    await verifyHistory(world);
  });

  it('rest on everything before them: undo comes off that history from its end backwards', async () => {
    const world = await historicalWorld(fixture);
    // A world command beneath that writer's standing approvals cannot be undone…
    const refused = await undo(world, step('rain-on-square'));
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(blockersOf(refused)).toEqual(
      expect.arrayContaining([step('approve-mira'), step('approve-road-map-1')]),
    );
    // …while the last of them can, its older battle map back to a candidate.
    expect(codeOf(await undo(world, step('approve-road-map-1')))).toBe('accepted');
    const { assets } = (await world.state()).assets;
    expect(assets.get(asset('request-road-map-1'))?.status).toBe('CANDIDATE');
    expect(assets.get(asset('request-road-map-2'))?.status).toBe('APPROVED');
    await verifyHistory(world);
  });
});
