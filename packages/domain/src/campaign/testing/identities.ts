import type { CampaignIdentities, CampaignPackage } from '@ltw/contracts';

const uuid = (namespace: number, counter: number): string =>
  `1d66264a-${namespace.toString(16).padStart(4, '0')}-4000-8000-${counter.toString(16).padStart(12, '0')}`;

/** Deterministic for a complete fixture, independent of its array order; not a real registry. */
export function testCampaignIdentities(content: CampaignPackage): CampaignIdentities {
  const keyed = (keys: readonly string[], namespace: number): Record<string, string> =>
    Object.fromEntries(
      [...new Set(keys)].sort().map((key, index) => [key, uuid(namespace, index + 1)]),
    );
  return {
    entities: keyed(
      content.entities.map((entity) => entity.key),
      1,
    ),
    knowledge: keyed(
      content.knowledge.map((record) => record.key),
      2,
    ),
    clues: keyed(
      content.clues.map((clue) => clue.key),
      3,
    ),
    encounters: keyed(
      content.encounters.map((encounter) => encounter.key),
      4,
    ),
    scene: uuid(5, 1),
  };
}
