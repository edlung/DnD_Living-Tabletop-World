import { describe, expect, it } from 'vitest';

import { ASHEN_CIRCLE } from '../authoring/testing/world.ts';
import { knownEntityIds } from '../knowledge/projection.ts';
import { worldTimeAt } from '../kernel/world-time.ts';
import { hash } from '../assets/testing/world.ts';
import { DAY1, DAY2, DM_VIEW, visualWorld, type VisualWorld } from './testing/world.ts';
import { assetContentAt, entityPresentationAt, scenePresentationAt } from './views.ts';

/**
 * What a perspective sees of the past (owner decision of 2026-10-04, ADR
 * 0023 §3): what it knows now, plus what it perceived then; state details
 * only for what it perceived then. Elowen spends Day 1 in the Market Square,
 * then on Day 2 steps into Orin's Alchemy, where a hooded watcher stands,
 * and back out at noon.
 */
const WATCHER = 'hooded-watcher';
const ORIN = 'orin-stonebeard';
const INSIDE = worldTimeAt(2, 11);
const NOON = worldTimeAt(2, 12);

async function walkedThrough(): Promise<VisualWorld & { images: Record<string, string> }> {
  const world = await visualWorld();
  await world.dm({
    type: 'CreateEntity',
    entityId: WATCHER,
    kind: 'npc',
    name: 'Sable WATCHERNAME',
    description: 'WATCHERDESCRIPTION',
    existsSince: null,
    placement: { locationId: 'orins-alchemy', since: null },
  });
  const images = {
    watcher: await world.approved(WATCHER, 1),
    orin: await world.approved(ORIN, 2),
    orinDead: await world.approved(ORIN, 3, { variant: 'derived', label: 'dead' }),
    ravenford: await world.approved('ravenford', 4),
    ravenfordRainDm: await world.approved('ravenford', 5, {
      variant: 'derived',
      label: 'rain',
      audience: 'dm',
    }),
  };
  await world.dayTwo();
  await world.enter('orins-alchemy');
  await world.dm({ type: 'AdvanceWorldTime', to: NOON });
  await world.enter('market-square');
  await world.dm({ type: 'ChangeEntityStatus', entityId: ORIN, status: 'dead' });
  return { ...world, images };
}

describe('a player’s view of the past', () => {
  it('shows what Elowen perceived then, though she neither knows nor sees it now', async () => {
    const world = await walkedThrough();
    const snapshot = await world.snapshot();
    const elowen = await world.elowen();
    expect(knownEntityIds(snapshot.state, elowen).has(WATCHER)).toBe(false);

    const inside = entityPresentationAt(snapshot, elowen, WATCHER, INSIDE);
    expect(inside?.presentation).toMatchObject({
      observed: true,
      status: 'active',
      // Indoors, the rain does not fall on it.
      weather: null,
      tags: ['day'],
      image: { variant: 'reference', contentHash: hash(1) },
    });
    // Before she went in (Day 1) and after she came out (now).
    for (const time of [DAY1, null]) {
      expect(entityPresentationAt(snapshot, elowen, WATCHER, time)).toBeNull();
    }
    const serialized = JSON.stringify(inside);
    for (const secret of ['WATCHERNAME', 'WATCHERDESCRIPTION', 'Sable', '~asset', '#']) {
      expect(serialized).not.toContain(secret);
    }
    // Its bytes may be fetched for that time, and not for now.
    expect(assetContentAt(snapshot, elowen, hash(1), INSIDE)).not.toBeNull();
    expect(assetContentAt(snapshot, elowen, hash(1), snapshot.state.clock)).toBeNull();
  });

  it('shows what Elowen knows but did not perceive without saying how it was', async () => {
    const world = await walkedThrough();
    const snapshot = await world.snapshot();
    const elowen = await world.elowen();
    expect(knownEntityIds(snapshot.state, elowen).has(ORIN)).toBe(true);

    // Orin died while Elowen was outside: she sees his portrait, not his death.
    const now = entityPresentationAt(snapshot, elowen, ORIN, null)?.presentation;
    expect(now).toMatchObject({
      observed: false,
      status: null,
      vitals: null,
      weather: null,
      conditions: [],
      equipment: [],
      tags: ['day'],
      image: { contentHash: hash(2) },
    });
    // The DM sees him dead, in the variant his death calls for.
    expect(entityPresentationAt(snapshot, DM_VIEW, ORIN, null)?.presentation).toMatchObject({
      status: 'dead',
      image: { variant: 'derived', contentHash: hash(3) },
    });
    // While Elowen stood in his shop, she saw him alive there.
    expect(entityPresentationAt(snapshot, elowen, ORIN, INSIDE)?.presentation).toMatchObject({
      observed: true,
      status: 'active',
    });
  });

  it('lists who was in a place only when Elowen perceived them there', async () => {
    const world = await walkedThrough();
    const snapshot = await world.snapshot();
    const elowen = await world.elowen();

    const shopOnDay1 = scenePresentationAt(snapshot, elowen, 'orins-alchemy', DAY1);
    expect(shopOnDay1?.location).toMatchObject({ observed: false, weather: null });
    expect(shopOnDay1?.present).toEqual([]);
    // What the place is she knows, though not how it was (the table's sound, ADR 0059 §1).
    expect(shopOnDay1?.setting).toBe('indoors');

    const shopInside = scenePresentationAt(snapshot, elowen, 'orins-alchemy', INSIDE);
    expect(shopInside?.present.map((entity) => entity.entityId).sort()).toEqual(
      [ORIN, WATCHER, 'elowen-starwhisper'].sort(),
    );
    expect(shopInside?.setting).toBe('indoors');

    const square = scenePresentationAt(snapshot, elowen, 'market-square', DAY1);
    expect(square?.location).toMatchObject({ observed: true, weather: 'clear' });
    // The market square lies in Ravenford: a town's street.
    expect(square?.setting).toBe('town');
    expect(square?.present.map((entity) => entity.entityId)).toContain('mira-vale');
    // Ravenford around her was in view; its rain image is the DM's alone.
    expect(
      entityPresentationAt(snapshot, elowen, 'ravenford', DAY2)?.presentation.image?.contentHash,
    ).toBe(hash(4));
    expect(
      entityPresentationAt(snapshot, DM_VIEW, 'ravenford', DAY2)?.presentation.image?.contentHash,
    ).toBe(hash(5));
  });

  it('says a known place lies in a town only when the town is known too (ADR 0059 §1)', async () => {
    const world = await walkedThrough();
    for (const [entityId, name, type, parentId] of [
      ['hidden-town', 'Hidden Town', 'settlement', null],
      ['lonely-well', 'Lonely Well', 'site', 'hidden-town'],
    ] as const) {
      await world.dm({
        type: 'CreateEntity',
        entityId,
        kind: 'location',
        name,
        existsSince: null,
        location: { type, parentId },
      });
    }
    await world.dm({
      type: 'AddKnowledge',
      knowledgeId: 'pub-lonely-well',
      scope: { kind: 'PUBLIC' },
      knowledgeType: 'FACT',
      statement: 'A well stands alone somewhere to the north.',
      subjects: ['lonely-well'],
      knownSince: null,
    });
    const snapshot = await world.snapshot();
    const party = await world.party();
    expect(scenePresentationAt(snapshot, party, 'lonely-well', null)?.setting).toBe('wild');
    expect(scenePresentationAt(snapshot, party, 'hidden-town', null)).toBeNull();
    expect(scenePresentationAt(snapshot, DM_VIEW, 'lonely-well', null)?.setting).toBe('town');
  });

  it('shows nothing of what Elowen never knew nor saw, or of what did not exist yet', async () => {
    const world = await walkedThrough();
    await world.dm({
      type: 'CreateEntity',
      entityId: 'late-arrival',
      kind: 'npc',
      name: 'Late arrival',
      existsSince: NOON,
      placement: { locationId: 'market-square', since: NOON },
    });
    const snapshot = await world.snapshot();
    const elowen = await world.elowen();
    for (const perspective of [elowen, await world.party()]) {
      expect(entityPresentationAt(snapshot, perspective, ASHEN_CIRCLE, null)).toBeNull();
      expect(entityPresentationAt(snapshot, perspective, 'nobody', null)).toBeNull();
      expect(scenePresentationAt(snapshot, perspective, 'mira-vale', null)).toBeNull();
    }
    expect(entityPresentationAt(snapshot, DM_VIEW, 'late-arrival', DAY2)).toBeNull();
    expect(entityPresentationAt(snapshot, DM_VIEW, 'late-arrival', null)).not.toBeNull();
    expect(
      entityPresentationAt(snapshot, elowen, 'late-arrival', null)?.presentation.observed,
    ).toBe(true);
  });

  it('never gives Orin equipment an image shows (ADVERSARIAL_TESTS.md K.2)', async () => {
    const world = await walkedThrough();
    await world.approved(ORIN, 9, { variant: 'derived', label: 'greatsword' });
    const snapshot = await world.snapshot();
    const orin = entityPresentationAt(snapshot, DM_VIEW, ORIN, INSIDE)?.presentation;
    expect(orin?.equipment).toEqual([]);
    expect(orin?.tags).not.toContain('greatsword');
    expect(orin?.image?.contentHash).toBe(hash(2));
    expect(snapshot.state.characterSheets.has(ORIN)).toBe(false);
    expect(snapshot.state.statBlocks.has(ORIN)).toBe(false);
  });

  it('never says where a known someone was in a place seen only from inside or around it', async () => {
    const world = await walkedThrough();
    await world.dm({ type: 'PlaceEntity', entityId: 'captain-thorne', locationId: 'ravenford' });
    const snapshot = await world.snapshot();
    const elowen = await world.elowen();
    expect(knownEntityIds(snapshot.state, elowen).has('captain-thorne')).toBe(true);

    // From the square, Elowen sees Ravenford around her, not who stands elsewhere in it.
    const town = scenePresentationAt(snapshot, elowen, 'ravenford', null);
    expect(town?.location.observed).toBe(true);
    expect(town?.present.map((entity) => entity.entityId)).not.toContain('captain-thorne');
    expect(
      scenePresentationAt(snapshot, DM_VIEW, 'ravenford', null)?.present.map((e) => e.entityId),
    ).toContain('captain-thorne');
  });
});
