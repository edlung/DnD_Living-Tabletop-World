import type { ClaimTarget } from '@ltw/contracts';

/**
 * Fact keys (docs/adr/0007-world-kernel-model-and-event-store.md, "Undo
 * footprint"): the names of the canonical facts footprints read and write.
 */
export type FactKey = string;

export const facts = {
  campaign: (): FactKey => 'campaign',
  clock: (): FactKey => 'world#clock',
  activeScene: (): FactKey => 'world#activeScene',
  entity: (id: string): FactKey => `entity:${id}`,
  entityProfile: (id: string): FactKey => `entity:${id}#profile`,
  entityPlacement: (id: string): FactKey => `entity:${id}#placement`,
  entityStatus: (id: string): FactKey => `entity:${id}#status`,
  scene: (id: string): FactKey => `scene:${id}`,
  sceneEnded: (id: string): FactKey => `scene:${id}#ended`,
  knowledge: (id: string): FactKey => `knowledge:${id}`,
  rosterCharacter: (characterId: string): FactKey => `roster:character:${characterId}`,
  rosterPlayer: (actorId: string): FactKey => `roster:player:${actorId}`,
  memory: (id: string): FactKey => `memory:${id}`,
  session: (id: string): FactKey => `session:${id}`,
  sessionEnded: (id: string): FactKey => `session:${id}#ended`,
  activeSession: (): FactKey => 'world#activeSession',
  sheet: (entityId: string): FactKey => `sheet:${entityId}`,
  clue: (id: string): FactKey => `clue:${id}`,
  disclosure: (knowledgeId: string): FactKey => `disclosure:${knowledgeId}`,
  attempt: (key: string): FactKey => `attempt:${key}`,
  revealed: (key: string): FactKey => `revealed:${key}`,
  shared: (key: string): FactKey => `shared:${key}`,
  claim: (target: ClaimTarget): FactKey =>
    target.kind === 'knowledge'
      ? `claim:knowledge:${target.knowledgeId}`
      : `claim:clue:${target.clueId}`,
  contradiction: (key: string): FactKey => `contradiction:${key}`,
  encounter: (): FactKey => 'world#encounter',
  statBlock: (entityId: string): FactKey => `statblock:${entityId}`,
  reaction: (windowId: string): FactKey => `reaction:${windowId}`,
  relationship: (npcId: string): FactKey => `relationship:${npcId}`,
  shown: (key: string): FactKey => `shown:${key}`,
  assetRequest: (requestId: string): FactKey => `assetrequest:${requestId}`,
  assetJob: (requestId: string): FactKey => `assetjob:${requestId}`,
  asset: (assetId: string): FactKey => `asset:${assetId}`,
  assetCanonical: (entityId: string): FactKey => `assetcanonical:${entityId}`,
  weather: (locationId: string): FactKey => `weather:${locationId}`,
  chronicle: (chronicleId: string): FactKey => `chronicle:${chronicleId}`,
};

export const allEntityFacts = (id: string): FactKey[] => [
  facts.entity(id),
  facts.entityProfile(id),
  facts.entityPlacement(id),
  facts.entityStatus(id),
];

/** Reading an entity for validation depends on its existence and status. */
export const entityChecked = (id: string): FactKey[] => [facts.entity(id), facts.entityStatus(id)];
