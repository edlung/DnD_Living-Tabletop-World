import { describe, expect, it } from 'vitest';

import { surroundings } from './surroundings.ts';
import {
  DM,
  ELOWEN,
  ELOWEN_FORBIDDEN_MARKERS,
  elowenView,
  perspective,
  seedRavenford,
} from './testing/ravenford.ts';

describe('perceived surroundings', () => {
  it('returns the character’s actual place and perceived locations only', async () => {
    const { state } = await seedRavenford();
    const view = surroundings(state, elowenView(state));
    expect(view).toEqual({
      perspective: `CHARACTER:${ELOWEN}`,
      actingCharacterId: ELOWEN,
      location: { entityId: 'market-square', kind: 'location', name: 'Market Square' },
      nearby: [{ entityId: 'ravenford', kind: 'location', name: 'Ravenford' }],
    });
    // Known absent places and occupants do not become nearby destinations.
    expect(JSON.stringify(view)).not.toContain('orins-alchemy');
    expect(JSON.stringify(view)).not.toContain('mira-vale');
    for (const marker of ELOWEN_FORBIDDEN_MARKERS)
      expect(JSON.stringify(view)).not.toContain(marker);
  });

  it('reveals an unnamed child place on arrival, without creating knowledge or changing canon', async () => {
    const world = await seedRavenford();
    expect(
      (
        await world.submit({
          type: 'EnterLocation',
          characterId: ELOWEN,
          locationId: 'old-trade-road',
        })
      ).status,
    ).toBe('accepted');
    const state = await world.current();
    const before = structuredClone(state);
    expect(surroundings(state, elowenView(state))?.nearby).toEqual([
      { entityId: 'location-f3b82c8b', kind: 'location', name: null },
    ]);
    expect(state).toEqual(before);
    expect(
      (
        await world.submit({
          type: 'EnterLocation',
          characterId: ELOWEN,
          locationId: 'location-f3b82c8b',
        })
      ).status,
    ).toBe('accepted');
    const atSite = await world.current();
    expect(surroundings(atSite, elowenView(atSite))).toMatchObject({
      location: { entityId: 'location-f3b82c8b', kind: 'location', name: null },
      nearby: [{ entityId: 'old-trade-road', kind: 'location', name: 'Old Trade Road' }],
    });
    expect(
      (
        await world.submit({
          type: 'ExamineEntity',
          characterId: ELOWEN,
          entityId: 'location-f3b82c8b',
          method: 'inspect',
        })
      ).status,
    ).toBe('accepted');
    const discovered = await world.current();
    expect(surroundings(discovered, elowenView(discovered))?.location?.name).not.toBeNull();
  });

  it('keeps hidden topology, descriptions, status, and an unknown place’s name out of the output', async () => {
    const world = await seedRavenford();
    await world.apply({ type: 'PlaceEntity', entityId: ELOWEN, locationId: 'old-trade-road' });
    const before = await world.current();
    const view = surroundings(before, elowenView(before));
    const changed = await world.apply(
      {
        type: 'UpdateEntityProfile',
        entityId: 'location-f3b82c8b',
        name: 'SECRET PLACE NAME',
        description: 'SECRET DESCRIPTION',
      },
      {
        type: 'CreateEntity',
        entityId: 'remote-chamber',
        kind: 'location',
        name: 'SECRET CHAMBER',
        existsSince: null,
        location: { type: 'site', parentId: 'north-gate' },
      },
      {
        type: 'AddKnowledge',
        scope: { kind: 'DM' },
        knowledgeType: 'SECRET',
        statement: 'SECRET GEOGRAPHY',
        subjects: ['remote-chamber'],
        knownSince: null,
      },
    );
    expect(surroundings(changed, elowenView(changed))).toEqual(view);
    const entities = new Map(changed.entities);
    const site = entities.get('location-f3b82c8b');
    if (!site) throw new Error('Missing site');
    entities.set(site.entityId, {
      ...site,
      status: 'destroyed',
      ...{ privateNotes: 'SECRET FIELD' },
    });
    expect(surroundings({ ...changed, entities }, elowenView(changed))).toEqual(view);
  });

  it('does not enumerate a place before its existence, even if its identity is known', async () => {
    const world = await seedRavenford();
    await world.apply({ type: 'PlaceEntity', entityId: ELOWEN, locationId: 'old-trade-road' });
    const state = await world.current();
    const site = state.entities.get('location-f3b82c8b');
    if (!site) throw new Error('Missing site');
    const entities = new Map(state.entities).set(site.entityId, {
      ...site,
      existsSince: state.clock + 1,
    });
    expect(surroundings({ ...state, entities }, elowenView(state))?.nearby).toEqual([]);
  });

  it('returns empty surroundings for an unplaced character rather than a fallback scene', async () => {
    const world = await seedRavenford();
    const state = await world.apply({
      type: 'CreateEntity',
      entityId: 'unplaced-character',
      kind: 'character',
      name: 'Unplaced',
      existsSince: null,
    });
    const view = perspective(state, DM, { kind: 'CHARACTER', characterId: 'unplaced-character' });
    expect(surroundings(state, view)).toEqual({
      perspective: 'CHARACTER:unplaced-character',
      actingCharacterId: 'unplaced-character',
      location: null,
      nearby: [],
    });
  });

  it('rejects perspectives without an acting character and keeps the DM’s character preview restricted', async () => {
    const { state } = await seedRavenford();
    for (const request of [
      { kind: 'DM' },
      { kind: 'PUBLIC' },
      { kind: 'PARTY' },
      { kind: 'NPC', npcId: 'mira-vale' },
    ] as const) {
      expect(surroundings(state, perspective(state, DM, request))).toBeNull();
    }
    expect(
      surroundings(state, perspective(state, DM, { kind: 'CHARACTER', characterId: ELOWEN })),
    ).toEqual(surroundings(state, elowenView(state)));
  });
});
