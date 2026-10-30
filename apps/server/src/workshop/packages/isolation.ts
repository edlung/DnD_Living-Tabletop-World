import { createCombatEngine } from '@ltw/combat';
import {
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
  WorldEngine,
  type CampaignSnapshot,
} from '@ltw/domain';
import { skillCheckPort } from '@ltw/rules';

/** Only local memory, deterministic sources and the normal domain/rules adapters. */
export function isolatedCampaignEngine(
  store: InMemoryEventStore,
  recordedAt: string,
  namespace: number,
): WorldEngine {
  return new WorldEngine({
    store,
    ids: new SequentialIds(namespace),
    clock: new SteppingClock(recordedAt, 1),
    backoff: () => Promise.resolve(),
    combat: createCombatEngine(),
    entropy: { next: () => 2 ** 31 },
    checks: skillCheckPort({ roll: (sides) => Math.max(1, Math.ceil(sides / 2)) }),
  });
}

/** Copy already-decided history into a fresh memory store, never a production store. */
export async function forkCampaignStore(
  source: InMemoryEventStore,
  campaignId: string,
  snapshot: CampaignSnapshot,
) {
  const copy = new InMemoryEventStore();
  for (const command of await source.loadCommands(campaignId)) {
    await copy.append({
      campaignId,
      expectedVersion: command.firstSequence - 1,
      command,
      events: snapshot.history.slice(command.firstSequence - 1, command.lastSequence),
    });
  }
  return copy;
}
