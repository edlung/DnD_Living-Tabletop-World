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
    ...questIdentities(content),
  };
}

/** What the engine's bootstrap command carries: its plan never publishes quests. */
export function testBootstrapIdentities(content: CampaignPackage) {
  const { entities, knowledge, clues, encounters, scene } = testCampaignIdentities(content);
  return { entities, knowledge, clues, encounters, scene };
}

/** Opaque quest and stage IDs in their public form (Gate 07, G07-03). */
function questIdentities(content: CampaignPackage) {
  const hex = (namespace: number, counter: number) => uuid(namespace, counter).replaceAll('-', '');
  const quests = [...content.quests].sort((a, b) => (a.questId < b.questId ? -1 : 1));
  let stage = 0;
  return {
    quests: Object.fromEntries(
      quests.map((quest, index) => [quest.questId, `q-${hex(6, index + 1)}`]),
    ),
    stages: Object.fromEntries(
      quests.map((quest) => [
        quest.questId,
        Object.fromEntries(
          [...new Set(quest.milestones.map((milestone) => milestone.stage))]
            .sort()
            .map((key) => [key, `s-${hex(7, ++stage)}`]),
        ),
      ]),
    ),
  };
}
