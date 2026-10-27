import { describe, expect, it } from 'vitest';

import { perceivedEntityIds } from './perception.ts';
import { DM, ELOWEN, investigationWorld } from './testing/world.ts';

/** ADR 0012 "Perception": here, the parent location, child locations, and who is here. */
async function worldAfter(...commands: Record<string, unknown>[]) {
  const world = await investigationWorld();
  for (const command of commands) {
    const result = await world.submit(command, DM);
    if (result.status === 'rejected') throw new Error(result.code);
  }
  return world.state();
}

describe('perception', () => {
  it('perceives Market Square, Ravenford, Mira and herself, nothing else', async () => {
    const state = await worldAfter();
    expect([...perceivedEntityIds(state, ELOWEN)].sort()).toEqual([
      ELOWEN,
      'market-square',
      'mira-vale',
      'ravenford',
    ]);
  });

  it('includes child locations but not entities inside them, nor siblings', async () => {
    const state = await worldAfter({
      type: 'PlaceEntity',
      entityId: ELOWEN,
      locationId: 'ravenford',
    });
    const perceived = perceivedEntityIds(state, ELOWEN);
    for (const child of ['market-square', 'golden-stag-inn', 'orins-alchemy', 'north-gate']) {
      expect(perceived.has(child), child).toBe(true);
    }
    expect(perceived.has('mira-vale')).toBe(false);
    expect(perceived.has('orin-stonebeard')).toBe(false);
    expect(perceived.has('old-trade-road')).toBe(false);
  });

  it('does not perceive entities placed in the parent location', async () => {
    const state = await worldAfter({
      type: 'CreateEntity',
      entityId: 'town-crier',
      kind: 'npc',
      name: 'Town Crier',
      existsSince: null,
      placement: { locationId: 'ravenford', since: null },
    });
    expect(perceivedEntityIds(state, ELOWEN).has('town-crier')).toBe(false);
  });

  it('follows the character when it moves', async () => {
    const state = await worldAfter({
      type: 'PlaceEntity',
      entityId: ELOWEN,
      locationId: 'location-f3b82c8b',
    });
    expect([...perceivedEntityIds(state, ELOWEN)].sort()).toEqual([
      ELOWEN,
      'feature-19c7c7f7', // Strange Symbol
      'feature-ccec7e50', // Tracks
      'item-0869f47a', // Goblin Weapon
      'item-08851105', // Burned Cargo
      'item-f44e7183', // Broken Wagon Wheel
      'location-f3b82c8b', // Abandoned Caravan Site
      'old-trade-road',
    ]);
  });

  it('perceives nothing when the character is not placed anywhere', async () => {
    const state = await worldAfter({
      type: 'CreateEntity',
      entityId: 'unplaced-hero',
      kind: 'character',
      name: 'Unplaced Hero',
      existsSince: null,
    });
    expect(perceivedEntityIds(state, 'unplaced-hero').size).toBe(0);
  });
});
