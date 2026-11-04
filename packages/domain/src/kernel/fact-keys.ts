import type { ClaimTarget } from '@ltw/contracts';

/**
 * Fact keys (docs/adr/0007-world-kernel-model-and-event-store.md, "Undo
 * footprint"): the names of the canonical facts footprints read and write.
 */
export type FactKey = string;

export const facts = {
  preparedParty: (): FactKey => 'party#prepared',
  bootstrap: (): FactKey => 'campaign#bootstrap',
  campaign: (): FactKey => 'campaign',
  campaignOptions: (): FactKey => 'campaign#options',
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
  /** When a creature died (docs/adr/0056-characters-from-the-srd.md §5). */
  death: (entityId: string): FactKey => `death:${entityId}`,
  /** A player's wish for their character's portrait (docs/adr/0056-…md §5). */
  portraitWish: (characterId: string): FactKey => `portraitwish:${characterId}`,
  chronicle: (chronicleId: string): FactKey => `chronicle:${chronicleId}`,
  /** An NPC's shop (docs/adr/0057-encounters-maps-loot.md §8). */
  merchant: (npcId: string): FactKey => `merchant:${npcId}`,
  /** A crafting project (docs/adr/0057-encounters-maps-loot.md §9). */
  crafting: (projectId: string): FactKey => `crafting:${projectId}`,
  /** A region's map and a route between two places (§10). */
  mapPins: (regionId: string): FactKey => `mappins:${regionId}`,
  route: (key: string): FactKey => `route:${key}`,
  /** A quest by hand (docs/adr/0058-campaign-content.md §2). */
  handQuest: (questId: string): FactKey => `handquest:${questId}`,
  possession: (itemId: string): FactKey => `possession:${itemId}`,
  /** A holder's worn set: slot occupancy is a premise of every equip (ADR 0039). */
  equipment: (holderId: string): FactKey => `equipment:${holderId}`,
  /**
   * A command's standing in current canon: every command writes its own, and
   * only its undo changes it. A record citing the command's events reads it
   * (Gate 05, G05-H02).
   */
  command: (commandId: string): FactKey => `command:${commandId}`,
};

export const allEntityFacts = (id: string): FactKey[] => [
  facts.entity(id),
  facts.entityProfile(id),
  facts.entityPlacement(id),
  facts.entityStatus(id),
];

/** Reading an entity for validation depends on its existence and status. */
export const entityChecked = (id: string): FactKey[] => [facts.entity(id), facts.entityStatus(id)];
