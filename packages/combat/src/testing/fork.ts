import { InMemoryEventStore, type EntropySource } from '@ltw/domain';

import { CAMPAIGN, roadWorld, type RoadWorld } from './road.ts';

/**
 * Test support: an independent copy of a world, rebuilt from its store
 * through the public EventStore API, for "what if this were undone?" checks
 * that must not touch the original (Gate 03). `entropy` replaces its dice.
 */
export async function forkWorld(
  world: RoadWorld,
  namespace = 99,
  entropy?: EntropySource,
): Promise<RoadWorld> {
  const store = new InMemoryEventStore();
  const events = (await world.store.loadStream(CAMPAIGN))?.events ?? [];
  for (const command of await world.store.loadCommands(CAMPAIGN)) {
    await store.append({
      campaignId: CAMPAIGN,
      expectedVersion: command.firstSequence - 1,
      command,
      events: events.slice(command.firstSequence - 1, command.lastSequence),
    });
  }
  return roadWorld({ shared: { store, namespace }, ...(entropy ? { entropy } : {}) });
}
