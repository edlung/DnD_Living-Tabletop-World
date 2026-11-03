import { beforeEach, describe, expect, it } from 'vitest';

import {
  PLAYER,
  createHarness,
  expectAccepted,
  expectRejected,
  seedBasicWorld,
  type Harness,
} from '../kernel/testing/kernel-harness.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { resolvePerspective } from '../knowledge/perspective.ts';
import { worldMapView } from './map-view.ts';

/**
 * The world map (docs/adr/0057-encounters-maps-loot.md §10): the DM pins the square, the inn and a
 * cave on the vale's map and sets routes between them; the hero, who knows of the vale, the square
 * and the inn but not the cave, sees those pinned and the route between them, never the cave or
 * its road. Pins and routes are undone as any change.
 */
let harness: Harness;

const create = (entityId: string, kind: string, extra: Record<string, unknown> = {}) => ({
  type: 'CreateEntity',
  entityId,
  kind,
  name: entityId,
  existsSince: null,
  ...extra,
});
const known = (subjects: string[]) => ({
  type: 'AddKnowledge',
  scope: { kind: 'PUBLIC' },
  knowledgeType: 'FACT',
  statement: `Everyone knows of ${subjects.join(' and ')}.`,
  subjects,
  knownSince: null,
});
const PINS = [
  { placeId: 'square', x: 0.2, y: 0.3 },
  { placeId: 'inn', x: 0.6, y: 0.4 },
  { placeId: 'cave', x: 0.9, y: 0.9 },
];
const road = (fromId: string, toId: string, miles = 3) => ({
  type: 'SetRoute',
  fromId,
  toId,
  route: { miles, terrain: 'grassland', road: true },
});

beforeEach(async () => {
  harness = createHarness();
  await seedBasicWorld(harness);
  for (const command of [
    create('vale', 'location', { location: { type: 'region', parentId: null } }),
    create('cave', 'location', { location: { type: 'site', parentId: null } }),
    create('hero', 'character', { placement: { locationId: 'square', since: null } }),
    { type: 'AssignCharacter', characterId: 'hero', playerActorId: PLAYER.actorId },
    known(['vale', 'square', 'inn']),
  ])
    expectAccepted(await harness.submit(command));
});

async function heroMap() {
  const state = await harness.state();
  const access = resolvePerspective(state, PLAYER, { kind: 'PLAYER' });
  if (!access.ok) throw new Error(access.reason);
  return worldMapView(state, access.perspective);
}

describe('the world map', () => {
  it('is the DM’s to pin and to join with routes', async () => {
    expectRejected(
      await harness.submit({ type: 'SetMapPins', regionId: 'vale', pins: PINS }, { actor: PLAYER }),
      'FORBIDDEN',
    );
    expectRejected(
      await harness.submit({ type: 'SetMapPins', regionId: 'hero', pins: PINS }),
      'ENTITY_NOT_FOUND',
    );
    expectAccepted(await harness.submit({ type: 'SetMapPins', regionId: 'vale', pins: PINS }));
    expectRejected(
      await harness.submit({ type: 'SetMapPins', regionId: 'vale', pins: PINS }),
      'NO_EFFECT',
    );
    expectAccepted(await harness.submit(road('square', 'inn')));
    expectAccepted(await harness.submit(road('cave', 'inn', 12)));
    const state = await harness.state();
    expect(checkWorldIntegrity(state)).toEqual([]);
    expect(state.mapPins.get('vale')).toHaveLength(3);
    // One route a pair, whichever way it is named.
    expect(state.routes.size).toBe(2);
    expectAccepted(
      await harness.submit({ ...road('inn', 'square', 5), fromId: 'inn', toId: 'square' }),
    );
    expect((await harness.state()).routes.size).toBe(2);
  });

  it('shows a player only the places it knows and the routes between them', async () => {
    for (const command of [
      { type: 'SetMapPins', regionId: 'vale', pins: PINS },
      road('square', 'inn'),
      road('cave', 'inn', 12),
    ])
      expectAccepted(await harness.submit(command));
    const map = await heroMap();
    expect(map.regions).toHaveLength(1);
    expect(map.regions[0]?.pins.map((pin) => pin.place.entityId)).toEqual(['square', 'inn']);
    expect(map.routes.map((route) => [route.from.entityId, route.to.entityId])).toEqual([
      ['square', 'inn'],
    ]);
    expect(map.hereId).toBe('square');
    expect(map.party.map((one) => one.entityId)).toEqual(['hero']);
  });

  it('is undone, the pins and the route as they were', async () => {
    const pinned = expectAccepted(
      await harness.submit({ type: 'SetMapPins', regionId: 'vale', pins: PINS }),
    );
    const joined = expectAccepted(await harness.submit(road('square', 'inn')));
    expectAccepted(
      await harness.submit({ type: 'UndoCommand', targetCommandId: joined.commandId }),
    );
    expectAccepted(
      await harness.submit({ type: 'UndoCommand', targetCommandId: pinned.commandId }),
    );
    const state = await harness.state();
    expect(state.routes.size).toBe(0);
    expect(state.mapPins.size).toBe(0);
    expect(checkWorldIntegrity(state)).toEqual([]);
  });
});
