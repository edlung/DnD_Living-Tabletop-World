import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { CAMPAIGN } from '../authoring/testing/world.ts';
import type { RecordedEvent } from '../kernel/events.ts';
import { DAY1_NIGHT, DM_VIEW, visualWorld, type VisualWorld } from '../visual/testing/world.ts';
import { entityPresentationAt } from '../visual/views.ts';
import { assetIdFor } from './records.ts';
import { codeOf, hash, type RequestOptions } from './testing/world.ts';

/**
 * Approving a picture supersedes the approved picture of its kind (docs/STAGE_330_DESIGN.md "DM
 * controls": Replace is a new request whose approval supersedes the current one; ADR 0035
 * amendment). The kind is what presentation shows one of: the reference, a derived image per
 * label, a figure, a battle map. So the picture approved last is the one players see, even when it
 * was made before the one it replaces; undo puts the superseded picture back.
 */
const MIRA = 'mira-vale';
const ROAD = 'old-trade-road';
const NIGHT = { variant: 'derived', label: 'night' } as const;
const RAIN = { variant: 'derived', label: 'rain' } as const;
const figure = (label: string) => ({ variant: 'derived', label, purpose: 'figure' }) as const;
const battleMap = (label: string) =>
  ({ variant: 'derived', label, purpose: 'battle-map' }) as const;

/** A candidate of this kind, made with content `content`; its asset ID. */
async function candidate(
  world: VisualWorld,
  entityId: string,
  options: RequestOptions,
  content: number,
) {
  const requestId = await world.request(entityId, options);
  await world.start(requestId);
  await world.complete(requestId, content);
  return assetIdFor(requestId);
}

const accepted = async (result: Promise<CommandResult>) => {
  const outcome = await result;
  if (outcome.status !== 'accepted') throw new Error(`rejected: ${codeOf(outcome)}`);
  return outcome.commandId;
};

const statusOf = async (world: VisualWorld, assetId: string) =>
  (await world.state()).assets.assets.get(assetId)?.status;

const approvals = async (world: VisualWorld) =>
  ((await world.engine.load(CAMPAIGN))?.history ?? []).filter(
    (event): event is Extract<RecordedEvent, { type: 'AssetApproved' }> =>
      event.type === 'AssetApproved',
  );

describe('approving a picture supersedes the approved picture of its kind', () => {
  it('makes an older night picture approved after a newer one the one everyone sees at night', async () => {
    const world = await visualWorld();
    await world.approved(MIRA, 1);
    const older = await candidate(world, MIRA, NIGHT, 2);
    const newer = await candidate(world, MIRA, NIGHT, 3);
    await accepted(world.approve(newer));
    await accepted(world.approve(older));
    expect(await statusOf(world, older)).toBe('APPROVED');
    expect(await statusOf(world, newer)).toBe('SUPERSEDED');

    await world.dm({ type: 'AdvanceWorldTime', to: DAY1_NIGHT });
    const snapshot = await world.snapshot();
    for (const perspective of [DM_VIEW, await world.elowen(), await world.party()]) {
      const mira = entityPresentationAt(snapshot, perspective, MIRA, null)?.presentation;
      expect(mira?.tags).toContain('night');
      expect(mira?.image).toMatchObject({ variant: 'derived', contentHash: hash(2) });
    }
    await world.verified();
  });

  it('treats every figure and every battle map of an entity as one kind, whatever its label', async () => {
    const world = await visualWorld();
    await world.approved(MIRA, 1);
    await world.approved(ROAD, 2);
    const pose = await candidate(world, MIRA, figure('pose'), 3);
    const standing = await candidate(world, MIRA, figure('figure'), 4);
    const oldMap = await candidate(world, ROAD, battleMap('night'), 5);
    const newMap = await candidate(world, ROAD, battleMap('map'), 6);
    await accepted(world.approve(standing));
    await accepted(world.approve(pose));
    await accepted(world.approve(newMap));
    await accepted(world.approve(oldMap));
    expect(await statusOf(world, standing)).toBe('SUPERSEDED');
    expect(await statusOf(world, newMap)).toBe('SUPERSEDED');
    const snapshot = await world.snapshot();
    for (const perspective of [DM_VIEW, await world.elowen()]) {
      expect(
        entityPresentationAt(snapshot, perspective, MIRA, null)?.presentation.figure?.contentHash,
      ).toBe(hash(3));
    }
    expect(
      entityPresentationAt(snapshot, DM_VIEW, ROAD, null)?.presentation.battleMap?.contentHash,
    ).toBe(hash(5));
    await world.verified();
  });

  it('leaves the pictures of other kinds approved, and the canonical reference unchanged', async () => {
    const world = await visualWorld();
    const reference = await world.approved(MIRA, 1);
    const night = await world.approved(MIRA, 2, NIGHT);
    const rain = await world.approved(MIRA, 3, RAIN);
    const standing = await world.approved(MIRA, 4, figure('figure'));
    const nightAgain = await world.approved(MIRA, 5, NIGHT);
    const { assets, canonical } = (await world.state()).assets;
    expect(
      [reference, night, rain, standing, nightAgain].map((id) => assets.get(id)?.status),
    ).toEqual(['CANONICAL', 'SUPERSEDED', 'APPROVED', 'APPROVED', 'APPROVED']);
    expect(canonical.get(MIRA)).toBe(reference);
    // Only the approval that superseded something says so; a reference keeps `previous`.
    expect((await approvals(world)).map((event) => [event.schemaVersion, event.payload])).toEqual([
      [3, { assetId: reference, entityId: MIRA, variant: 'reference', previous: null }],
      [3, { assetId: night, entityId: MIRA, variant: 'derived', previous: null }],
      [3, { assetId: rain, entityId: MIRA, variant: 'derived', previous: null }],
      [3, { assetId: standing, entityId: MIRA, variant: 'derived', previous: null }],
      [
        3,
        {
          assetId: nightAgain,
          entityId: MIRA,
          variant: 'derived',
          previous: null,
          supersedes: [night],
        },
      ],
    ]);
    await world.verified();
  });

  it('is undone with the picture it superseded back, and holds the approval beneath it', async () => {
    const world = await visualWorld();
    await world.approved(MIRA, 1);
    const older = await candidate(world, MIRA, NIGHT, 2);
    const newer = await candidate(world, MIRA, NIGHT, 3);
    const first = await accepted(world.approve(newer));
    const second = await accepted(world.approve(older));
    // The later approval rests on the picture the first one approved.
    const refused = await world.undo(first);
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(refused.status === 'rejected' ? refused.details?.['blockers'] : null).toEqual([
      expect.objectContaining({ commandId: second, commandType: 'ApproveAsset' }),
    ]);
    expect(codeOf(await world.undo(second))).toBe('accepted');
    expect([await statusOf(world, older), await statusOf(world, newer)]).toEqual([
      'CANDIDATE',
      'APPROVED',
    ]);
    expect(codeOf(await world.undo(first))).toBe('accepted');
    expect(await statusOf(world, newer)).toBe('CANDIDATE');
    await world.verified();
  });

  it('leaves its kind without a picture once the approved one is retracted', async () => {
    const world = await visualWorld();
    await world.approved(MIRA, 1);
    const night = await world.approved(MIRA, 2, NIGHT);
    const again = await world.approved(MIRA, 3, NIGHT);
    const approval = (await approvals(world)).at(-1)?.causation.commandId ?? '';
    expect(codeOf(await world.retract(again))).toBe('accepted');
    expect([await statusOf(world, night), await statusOf(world, again)]).toEqual([
      'SUPERSEDED',
      'RETRACTED',
    ]);
    // A retraction is final: the approval it rests on stays.
    expect(codeOf(await world.undo(approval))).toBe('UNDO_UNSAFE');
    await world.dm({ type: 'AdvanceWorldTime', to: DAY1_NIGHT });
    const mira = entityPresentationAt(await world.snapshot(), DM_VIEW, MIRA, null)?.presentation;
    expect(mira?.image).toMatchObject({ variant: 'reference', contentHash: hash(1) });
    await world.verified();
  });

  it('supersedes the players’ picture with a DM-only one of its kind, as a DM-only reference does', async () => {
    const world = await visualWorld();
    await world.approved(MIRA, 1);
    const players = await world.approved(MIRA, 2, NIGHT);
    const dmOnly = await world.approved(MIRA, 3, { ...NIGHT, audience: 'dm' });
    expect([await statusOf(world, players), await statusOf(world, dmOnly)]).toEqual([
      'SUPERSEDED',
      'APPROVED',
    ]);
    await world.dm({ type: 'AdvanceWorldTime', to: DAY1_NIGHT });
    const snapshot = await world.snapshot();
    expect(
      entityPresentationAt(snapshot, await world.elowen(), MIRA, null)?.presentation.image,
    ).toMatchObject({ variant: 'reference', contentHash: hash(1) });
    expect(entityPresentationAt(snapshot, DM_VIEW, MIRA, null)?.presentation.image).toMatchObject({
      variant: 'derived',
      contentHash: hash(3),
    });
    await world.verified();
  });
});
