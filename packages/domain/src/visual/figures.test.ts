import { describe, expect, it } from 'vitest';

import { assetIdFor } from '../assets/records.ts';
import { hash } from '../assets/testing/world.ts';
import { knownEntityIds } from '../knowledge/projection.ts';
import { worldTimeAt } from '../kernel/world-time.ts';
import { DM_VIEW, visualWorld, type VisualWorld } from './testing/world.ts';
import { entityPresentationAt, scenePresentationAt } from './views.ts';

/**
 * Figures and battle maps in presentation (docs/adr/0035-images.md §4): a character's, NPC's or
 * creature's newest approved `figure`, and a location's newest approved `battle-map`, beside the
 * image ADR 0023 chooses by tags. Same visibility as images: approved only, players only the
 * players' audience, only of what the perspective may see; never chosen as the image.
 */
const ELOWEN = 'elowen-starwhisper';
const MIRA = 'mira-vale';
const ORIN = 'orin-stonebeard';
const ROAD = 'old-trade-road';
const SITE = 'location-f3b82c8b';
const SQUARE = 'market-square';
const NIGHT = worldTimeAt(1, 22);

const figure = (label = 'figure') => ({ variant: 'derived', label, purpose: 'figure' }) as const;
const battleMap = (label = 'map') =>
  ({ variant: 'derived', label, purpose: 'battle-map' }) as const;

async function furnished(): Promise<VisualWorld & { candidate: string }> {
  const world = await visualWorld();
  await world.approved(ELOWEN, 1);
  await world.approved(ELOWEN, 2, figure());
  // A newer figure, labelled like a state tag: it is still never her image.
  await world.approved(ELOWEN, 3, figure('night'));
  await world.approved(MIRA, 4);
  // Mira's figure is only a candidate.
  const candidate = await world.request(MIRA, figure());
  await world.start(candidate);
  await world.complete(candidate, 5);
  await world.approved(ORIN, 6);
  await world.approved(ORIN, 7, { ...figure(), audience: 'dm' });
  await world.approved(ROAD, 8);
  await world.approved(ROAD, 9, battleMap());
  await world.approved(ROAD, 10, battleMap('night'));
  await world.approved(SITE, 11);
  await world.approved(SITE, 12, battleMap());
  return { ...world, candidate };
}

describe('figures and battle maps in presentation', () => {
  it('show a character’s newest approved figure and a place’s newest battle map', async () => {
    const world = await furnished();
    const snapshot = await world.snapshot();
    const elowen = await world.elowen();
    for (const perspective of [elowen, await world.party(), DM_VIEW]) {
      const her = entityPresentationAt(snapshot, perspective, ELOWEN, null)?.presentation;
      expect(her).toMatchObject({
        image: { purpose: 'image', variant: 'reference', contentHash: hash(1) },
        figure: { purpose: 'figure', variant: 'derived', contentHash: hash(3) },
        battleMap: null,
      });
      const road = entityPresentationAt(snapshot, perspective, ROAD, null)?.presentation;
      expect(road).toMatchObject({
        image: { contentHash: hash(8) },
        figure: null,
        battleMap: { purpose: 'battle-map', contentHash: hash(10) },
      });
    }
  });

  it('never choose a figure or a battle map as the image, whatever its label', async () => {
    const world = await furnished();
    // The road's own night image, beside its battle map labelled `night`.
    await world.approved(ROAD, 13, { variant: 'derived', label: 'night' });
    expect((await world.snapshot()).state.clock).toBeLessThan(NIGHT);
    await world.dm({ type: 'AdvanceWorldTime', to: NIGHT });
    const snapshot = await world.snapshot();
    const her = entityPresentationAt(snapshot, DM_VIEW, ELOWEN, null)?.presentation;
    expect(her?.tags).toContain('night');
    expect(her?.image?.contentHash).toBe(hash(1));
    expect(her?.figure?.contentHash).toBe(hash(3));
    const road = entityPresentationAt(snapshot, DM_VIEW, ROAD, null)?.presentation;
    expect(road?.image).toMatchObject({
      variant: 'derived',
      purpose: 'image',
      contentHash: hash(13),
    });
    expect(road?.battleMap?.contentHash).toBe(hash(10));
  });

  it('never show a candidate, and show a DM-only figure to the DM alone', async () => {
    const world = await furnished();
    const snapshot = await world.snapshot();
    const elowen = await world.elowen();
    expect(snapshot.state.assets.assets.get(assetIdFor(world.candidate))?.status).toBe('CANDIDATE');
    for (const perspective of [elowen, await world.party(), DM_VIEW]) {
      expect(entityPresentationAt(snapshot, perspective, MIRA, null)?.presentation).toMatchObject({
        image: { contentHash: hash(4) },
        figure: null,
      });
    }
    expect(entityPresentationAt(snapshot, elowen, ORIN, null)?.presentation.figure).toBeNull();
    expect(entityPresentationAt(snapshot, DM_VIEW, ORIN, null)?.presentation.figure).toMatchObject({
      contentHash: hash(7),
    });
    // Once approved, Mira's figure is shown to everyone who sees her.
    await world.approve(assetIdFor(world.candidate));
    const after = await world.snapshot();
    expect(entityPresentationAt(after, elowen, MIRA, null)?.presentation.figure).toMatchObject({
      contentHash: hash(5),
    });
  });

  it('show nothing of a place the perspective may not see, battle map included', async () => {
    const world = await furnished();
    const snapshot = await world.snapshot();
    const elowen = await world.elowen();
    expect(knownEntityIds(snapshot.state, elowen).has(SITE)).toBe(false);
    expect(entityPresentationAt(snapshot, elowen, SITE, null)).toBeNull();
    expect(scenePresentationAt(snapshot, elowen, SITE, null)).toBeNull();
    expect(
      entityPresentationAt(snapshot, DM_VIEW, SITE, null)?.presentation.battleMap,
    ).toMatchObject({ contentHash: hash(12) });
    const serialized = JSON.stringify(
      entityPresentationAt(snapshot, elowen, ELOWEN, null)?.presentation,
    );
    for (const secret of ['~asset', '#', 'figure-night', 'local', 'placeholder']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('give the figures of the people a scene lists', async () => {
    const world = await furnished();
    const snapshot = await world.snapshot();
    const scene = scenePresentationAt(snapshot, DM_VIEW, SQUARE, null);
    const people = Object.fromEntries(
      (scene?.present ?? []).map((entity) => [entity.entityId, entity.figure?.contentHash ?? null]),
    );
    expect(people[ELOWEN]).toBe(hash(3));
    expect(people[MIRA]).toBeNull();
    expect(scene?.location.battleMap).toBeNull();
  });
});
