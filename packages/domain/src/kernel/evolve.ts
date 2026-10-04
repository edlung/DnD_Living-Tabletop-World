import { applyCharacterSheetSet } from '../character/character.ts';
import {
  applyCombatEnded,
  applyCombatRecord,
  applyCombatRestore,
  applyCombatStarted,
  applyCombatantUpdated,
  applyStatBlockSet,
  applyTurnStarted,
} from '../combat/evolve.ts';
import {
  applyReactionDeclined,
  applyReactionRestore,
  applyReactionUsed,
  applyReactionWindowExpired,
  applyReactionWindowOpened,
  applyReactionWindowResolved,
} from '../combat/reaction-evolve.ts';
import {
  applyClaimSet,
  applyContradictionDetected,
  applyEpistemicRestore,
} from '../contradiction/evolve.ts';
import {
  applyClueAdded,
  applyDisclosureSet,
  applyEvidenceExamined,
  applyEvidenceShown,
  applyInformationShared,
  applyInsightChecked,
  applyInvestigationRestore,
  applyPremisesRecorded,
} from '../investigation/evolve.ts';
import { applyCharacterAssigned, applyKnowledgeAssigned } from '../knowledge/evolve.ts';
import { applyMemoryRecorded, applySessionEnded, applySessionStarted } from '../memory/evolve.ts';
import { applyAssetEvent, applyAssetRestore } from '../assets/evolve.ts';
import { applyRelationshipChanged, applyRelationshipRestore } from '../relationships/evolve.ts';
import { CorruptHistoryError } from './corrupt-history.ts';
import type { RecordedEvent, Restore } from './events.ts';
import { withEntry, withoutEntry } from './maps.ts';
import { EMPTY_WORLD_STATE, type EntityState, type SceneState, type WorldState } from './state.ts';

/**
 * Folds recorded events into canonical state. Pure and deterministic: the
 * same history always yields the same state (ADR 0006 §1, §6). An event that
 * cannot apply means the stored history is corrupt, never a user error.
 */
export { CorruptHistoryError };

export function replay(
  events: readonly RecordedEvent[],
  options: { readonly untilSequence?: number } = {},
): WorldState {
  let state = EMPTY_WORLD_STATE;
  for (const event of events) {
    if (options.untilSequence !== undefined && event.sequence > options.untilSequence) break;
    state = evolve(state, event);
  }
  return state;
}

export function evolve(state: WorldState, event: RecordedEvent): WorldState {
  if (event.sequence !== state.version + 1) {
    throw new CorruptHistoryError(
      `expected sequence ${state.version + 1}, got ${event.sequence} (${event.type})`,
    );
  }
  if (state.campaign !== null && event.campaignId !== state.campaign.campaignId) {
    throw new CorruptHistoryError(`event ${event.sequence} belongs to another campaign`);
  }
  if (state.campaign === null && event.type !== 'CampaignCreated') {
    throw new CorruptHistoryError(`stream must start with CampaignCreated, got ${event.type}`);
  }
  const applied = apply(state, event);
  return { ...applied, version: event.sequence, commands: trackCommand(applied, event) };
}

function apply(state: WorldState, event: RecordedEvent): WorldState {
  switch (event.type) {
    case 'CampaignCreated': {
      if (state.campaign !== null) throw new CorruptHistoryError('campaign created twice');
      const { campaignId, name, worldName, startsAt, dmActorId } = event.payload;
      return {
        ...state,
        campaign: { campaignId, name, worldName, startsAt, dmActorId },
        clock: startsAt,
      };
    }
    case 'EntityCreated': {
      const { entityId, location } = event.payload;
      if (state.usedIds.has(entityId)) throw new CorruptHistoryError(`id ${entityId} reused`);
      if (location?.parentId) requireLocation(state, location.parentId);
      const entity: EntityState = { ...event.payload, placement: null, status: 'active' };
      return {
        ...state,
        entities: withEntry(state.entities, entityId, entity),
        usedIds: new Set(state.usedIds).add(entityId),
      };
    }
    case 'EntityPlaced': {
      const { entityId, locationId, since } = event.payload;
      requireLocation(state, locationId);
      return updateEntity(state, entityId, { placement: { locationId, since } });
    }
    case 'EntityProfileUpdated': {
      const { entityId, name, description } = event.payload;
      const current = requireEntity(state, entityId);
      return updateEntity(state, entityId, {
        name: name?.to ?? current.name,
        description: description?.to ?? current.description,
      });
    }
    case 'EntityStatusChanged':
      return updateEntity(state, event.payload.entityId, { status: event.payload.to });
    case 'SceneStarted': {
      const { sceneId, title, locationId } = event.payload;
      if (state.usedIds.has(sceneId)) throw new CorruptHistoryError(`id ${sceneId} reused`);
      requireLocation(state, locationId);
      const scene: SceneState = {
        sceneId,
        title,
        locationId,
        startedAt: event.worldTime,
        endedAt: null,
      };
      return {
        ...state,
        scenes: withEntry(state.scenes, sceneId, scene),
        usedIds: new Set(state.usedIds).add(sceneId),
        activeSceneId: sceneId,
      };
    }
    case 'SceneEnded': {
      const scene = requireScene(state, event.payload.sceneId);
      return {
        ...state,
        scenes: withEntry(state.scenes, scene.sceneId, { ...scene, endedAt: event.worldTime }),
        activeSceneId: state.activeSceneId === scene.sceneId ? null : state.activeSceneId,
      };
    }
    case 'WorldTimeAdvanced': {
      if (event.payload.from !== state.clock || event.payload.to <= event.payload.from) {
        throw new CorruptHistoryError(`invalid world time advance at ${event.sequence}`);
      }
      return { ...state, clock: event.payload.to };
    }
    case 'CommandUndone':
      return applyUndo(state, event);
    case 'KnowledgeAssigned':
      return applyKnowledgeAssigned(state, event);
    case 'CharacterAssigned':
      return applyCharacterAssigned(state, event);
    case 'MemoryRecorded':
      return applyMemoryRecorded(state, event);
    case 'SessionStarted':
      return applySessionStarted(state, event);
    case 'SessionEnded':
      return applySessionEnded(state, event);
    case 'CharacterSheetSet':
      return applyCharacterSheetSet(state, event);
    case 'ClueAdded':
      return applyClueAdded(state, event);
    case 'DisclosureSet':
      return applyDisclosureSet(state, event);
    case 'EvidenceExamined':
      return applyEvidenceExamined(state, event);
    case 'InformationShared':
      return applyInformationShared(state, event);
    case 'ClaimSet':
      return applyClaimSet(state, event);
    case 'ContradictionDetected':
      return applyContradictionDetected(state, event);
    case 'PremisesRecorded':
      return applyPremisesRecorded(state, event);
    case 'CombatStarted':
      return applyCombatStarted(state, event);
    case 'TurnStarted':
      return applyTurnStarted(state, event);
    case 'CombatantUpdated':
      return applyCombatantUpdated(state, event);
    case 'CombatEnded':
      return applyCombatEnded(state, event);
    case 'StatBlockSet':
      return applyStatBlockSet(state, event);
    case 'AttackPerformed':
    case 'SpellCast':
    case 'DamageApplied':
    case 'HealingApplied':
    case 'SavingThrowRolled':
    case 'ConditionApplied':
    case 'DeathSaveRolled':
      return applyCombatRecord(state, event);
    case 'ReactionWindowOpened':
      return applyReactionWindowOpened(state, event);
    case 'ReactionUsed':
      return applyReactionUsed(state, event);
    case 'ReactionDeclined':
      return applyReactionDeclined(state, event);
    case 'ReactionWindowExpired':
      return applyReactionWindowExpired(state, event);
    case 'ReactionWindowResolved':
      return applyReactionWindowResolved(state, event);
    case 'RelationshipChanged':
      return applyRelationshipChanged(state, event);
    case 'EvidenceShown':
      return applyEvidenceShown(state, event);
    case 'InsightChecked':
      return applyInsightChecked(state, event);
    case 'AssetRequested':
    case 'AssetJobStarted':
    case 'AssetGenerated':
    case 'AssetJobFailed':
    case 'AssetRequestCancelled':
    case 'AssetRetracted':
    case 'AssetApproved':
      return applyAssetEvent(state, event);
    case 'AuthoringPremisesRecorded':
      // Reads only (ADR 0019 §2): the entities it names must exist.
      for (const premise of event.payload.premises) requireEntity(state, premise.entityId);
      return state;
  }
}

function applyUndo(
  state: WorldState,
  event: Extract<RecordedEvent, { type: 'CommandUndone' }>,
): WorldState {
  const target = state.commands.get(event.payload.targetCommandId);
  if (!target || target.undoneBy !== null) {
    throw new CorruptHistoryError(`cannot undo ${event.payload.targetCommandId}`);
  }
  // Removals first, then facet restores of entities/scenes that remain.
  const ordered = [...event.payload.restores].sort(
    (a, b) => Number(!isRemoval(a)) - Number(!isRemoval(b)),
  );
  let next = ordered.reduce(applyRestore, state);
  next = {
    ...next,
    commands: withEntry(next.commands, target.commandId, {
      ...target,
      undoneBy: event.causation.commandId,
    }),
  };
  return next;
}

const isRemoval = (restore: Restore) =>
  restore.fact === 'entity' || restore.fact === 'scene' || restore.fact === 'session';

function applyRestore(state: WorldState, restore: Restore): WorldState {
  switch (restore.fact) {
    case 'entity':
      requireEntity(state, restore.entityId);
      return { ...state, entities: withoutEntry(state.entities, restore.entityId) };
    case 'entity.profile':
      return updateEntity(state, restore.entityId, restore.value);
    case 'entity.placement':
      return updateEntity(state, restore.entityId, { placement: restore.value });
    case 'entity.status':
      return updateEntity(state, restore.entityId, { status: restore.value });
    case 'scene':
      requireScene(state, restore.sceneId);
      return { ...state, scenes: withoutEntry(state.scenes, restore.sceneId) };
    case 'scene.ended': {
      const scene = requireScene(state, restore.sceneId);
      return {
        ...state,
        scenes: withEntry(state.scenes, scene.sceneId, { ...scene, endedAt: restore.value }),
      };
    }
    case 'world.clock':
      return { ...state, clock: restore.value };
    case 'world.activeScene':
      return { ...state, activeSceneId: restore.value };
    case 'knowledge':
      if (!state.knowledge.has(restore.knowledgeId)) {
        throw new CorruptHistoryError(`unknown knowledge ${restore.knowledgeId}`);
      }
      return { ...state, knowledge: withoutEntry(state.knowledge, restore.knowledgeId) };
    case 'roster':
      if (state.roster.get(restore.characterId) !== restore.playerActorId) {
        throw new CorruptHistoryError(`unknown assignment of ${restore.characterId}`);
      }
      return { ...state, roster: withoutEntry(state.roster, restore.characterId) };
    case 'memory':
      if (!state.memories.has(restore.memoryId)) {
        throw new CorruptHistoryError(`unknown memory ${restore.memoryId}`);
      }
      return { ...state, memories: withoutEntry(state.memories, restore.memoryId) };
    case 'session':
      if (!state.sessions.has(restore.sessionId)) {
        throw new CorruptHistoryError(`unknown session ${restore.sessionId}`);
      }
      return { ...state, sessions: withoutEntry(state.sessions, restore.sessionId) };
    case 'session.ended': {
      const session = state.sessions.get(restore.sessionId);
      if (!session) throw new CorruptHistoryError(`unknown session ${restore.sessionId}`);
      return {
        ...state,
        sessions: withEntry(state.sessions, session.sessionId, {
          ...session,
          endedAt: restore.value,
        }),
      };
    }
    case 'world.activeSession':
      return { ...state, activeSessionId: restore.value };
    case 'sheet': {
      const sheets = new Map(state.characterSheets);
      if (restore.value === null) sheets.delete(restore.entityId);
      else sheets.set(restore.entityId, restore.value);
      return { ...state, characterSheets: sheets };
    }
    case 'clue':
    case 'disclosure':
    case 'attempt':
    case 'revealed':
    case 'shared':
    case 'shown':
      return applyInvestigationRestore(state, restore);
    case 'claim':
    case 'contradiction':
      return applyEpistemicRestore(state, restore);
    case 'encounter':
    case 'statblock':
      return applyCombatRestore(state, restore);
    case 'reactionWindow':
      return applyReactionRestore(state, restore);
    case 'relationship':
      return applyRelationshipRestore(state, restore);
    case 'assetRequest':
    case 'asset':
    case 'assetCanonical':
      return applyAssetRestore(state, restore);
  }
}

function trackCommand(state: WorldState, event: RecordedEvent): WorldState['commands'] {
  const { commandId, commandType } = event.causation;
  const trace = state.commands.get(commandId);
  if (!trace) {
    return withEntry(state.commands, commandId, {
      commandId,
      commandType,
      firstSequence: event.sequence,
      lastSequence: event.sequence,
      undoneBy: null,
    });
  }
  if (trace.lastSequence !== event.sequence - 1 || trace.commandType !== commandType) {
    throw new CorruptHistoryError(`command ${commandId} events are not contiguous`);
  }
  return withEntry(state.commands, commandId, { ...trace, lastSequence: event.sequence });
}

function requireEntity(state: WorldState, entityId: string): EntityState {
  const entity = state.entities.get(entityId);
  if (!entity) throw new CorruptHistoryError(`unknown entity ${entityId}`);
  return entity;
}

function requireLocation(state: WorldState, entityId: string): EntityState {
  const entity = requireEntity(state, entityId);
  if (entity.kind !== 'location') throw new CorruptHistoryError(`${entityId} is not a location`);
  return entity;
}

function requireScene(state: WorldState, sceneId: string): SceneState {
  const scene = state.scenes.get(sceneId);
  if (!scene) throw new CorruptHistoryError(`unknown scene ${sceneId}`);
  return scene;
}

function updateEntity(
  state: WorldState,
  entityId: string,
  changes: Partial<EntityState>,
): WorldState {
  const entity = requireEntity(state, entityId);
  return { ...state, entities: withEntry(state.entities, entityId, { ...entity, ...changes }) };
}
