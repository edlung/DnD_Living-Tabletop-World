import { holderOf } from '../knowledge/records.ts';
import type { KernelEvent, Restore } from './events.ts';

/**
 * Fact footprints (docs/adr/0007-world-kernel-model-and-event-store.md,
 * "Undo footprint"). Every event declares the canonical facts its decision
 * depended on (`reads`) and the facts it changed (`writes`). Footprints are
 * derived from stored payloads only, so they can be recomputed from history.
 *
 * Later domains must declare footprints for their events, including reads of
 * kernel facts (for example knowledge about an entity reads `entity:<id>`).
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
};

export interface Footprint {
  readonly reads: readonly FactKey[];
  readonly writes: readonly FactKey[];
}

const allEntityFacts = (id: string): FactKey[] => [
  facts.entity(id),
  facts.entityProfile(id),
  facts.entityPlacement(id),
  facts.entityStatus(id),
];

/** Reading an entity for validation depends on its existence and status. */
const entityChecked = (id: string): FactKey[] => [facts.entity(id), facts.entityStatus(id)];

export function footprintOf(event: KernelEvent): Footprint {
  // Every event happens at the current world time, so it depends on the clock.
  const clock = facts.clock();
  switch (event.type) {
    case 'CampaignCreated':
      return { reads: [], writes: [facts.campaign(), clock, facts.activeScene()] };
    case 'EntityCreated': {
      const parent = event.payload.location?.parentId;
      return {
        reads: [clock, ...(parent ? entityChecked(parent) : [])],
        writes: allEntityFacts(event.payload.entityId),
      };
    }
    case 'EntityPlaced':
      return {
        reads: [
          clock,
          ...entityChecked(event.payload.entityId),
          ...entityChecked(event.payload.locationId),
        ],
        writes: [facts.entityPlacement(event.payload.entityId)],
      };
    case 'EntityProfileUpdated':
      return {
        reads: [clock, facts.entity(event.payload.entityId)],
        writes: [facts.entityProfile(event.payload.entityId)],
      };
    case 'EntityStatusChanged':
      return {
        reads: [clock, facts.entity(event.payload.entityId)],
        writes: [facts.entityStatus(event.payload.entityId)],
      };
    case 'SceneStarted':
      return {
        reads: [clock, ...entityChecked(event.payload.locationId), facts.activeScene()],
        writes: [
          facts.scene(event.payload.sceneId),
          facts.sceneEnded(event.payload.sceneId),
          facts.activeScene(),
        ],
      };
    case 'SceneEnded':
      return {
        reads: [clock, facts.scene(event.payload.sceneId)],
        writes: [facts.sceneEnded(event.payload.sceneId), facts.activeScene()],
      };
    case 'WorldTimeAdvanced':
      return { reads: [clock], writes: [clock] };
    case 'CommandUndone':
      return { reads: [], writes: event.payload.restores.flatMap(restoredFacts) };
    case 'KnowledgeAssigned': {
      // A record depends on its holder, every entity it mentions, and its related records.
      const { scope, subjects, attributedTo, relations, knowledgeId } = event.payload;
      const holder = holderOf(scope);
      const entities = new Set([...subjects, ...(attributedTo ? [attributedTo] : [])]);
      if (holder !== null) entities.add(holder);
      return {
        reads: [
          clock,
          ...[...entities].map((id) => facts.entity(id)),
          ...relations.map((relation) => facts.knowledge(relation.knowledgeId)),
        ],
        writes: [facts.knowledge(knowledgeId)],
      };
    }
    case 'CharacterAssigned':
      return {
        reads: [clock, facts.entity(event.payload.characterId)],
        writes: [
          facts.rosterCharacter(event.payload.characterId),
          facts.rosterPlayer(event.payload.playerActorId),
        ],
      };
  }
}

/** Facts a restore entry rewrites. Removing an entity or scene rewrites all its facts. */
export function restoredFacts(restore: Restore): FactKey[] {
  switch (restore.fact) {
    case 'entity':
      return allEntityFacts(restore.entityId);
    case 'entity.profile':
      return [facts.entityProfile(restore.entityId)];
    case 'entity.placement':
      return [facts.entityPlacement(restore.entityId)];
    case 'entity.status':
      return [facts.entityStatus(restore.entityId)];
    case 'scene':
      return [facts.scene(restore.sceneId), facts.sceneEnded(restore.sceneId)];
    case 'scene.ended':
      return [facts.sceneEnded(restore.sceneId)];
    case 'world.clock':
      return [facts.clock()];
    case 'world.activeScene':
      return [facts.activeScene()];
    case 'knowledge':
      return [facts.knowledge(restore.knowledgeId)];
    case 'roster':
      return [
        facts.rosterCharacter(restore.characterId),
        facts.rosterPlayer(restore.playerActorId),
      ];
  }
}

/** True if a fact belongs to the given entity (its existence or any facet). */
export function isFactOfEntity(fact: FactKey, entityId: string): boolean {
  const key = facts.entity(entityId);
  return fact === key || fact.startsWith(`${key}#`);
}

/** True if a fact belongs to the given scene. */
export function isFactOfScene(fact: FactKey, sceneId: string): boolean {
  const key = facts.scene(sceneId);
  return fact === key || fact.startsWith(`${key}#`);
}
