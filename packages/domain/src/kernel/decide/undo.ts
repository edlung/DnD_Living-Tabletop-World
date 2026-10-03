import type { KernelCommandType } from '@ltw/contracts';

import {
  accept,
  reject,
  type Decision,
  type DecisionContext,
  type ResolvedCommandOf,
} from '../decision.ts';
import type { RecordedEvent, Restore } from '../events.ts';
import { replay } from '../evolve.ts';
import { footprintOf, restoredFacts, type FactKey } from '../facts.ts';
import { pairKey } from '../../contradiction/records.ts';
import { attemptKey, scopedKey } from '../../investigation/records.ts';
import { scopeKey } from '../../knowledge/records.ts';
import type { WorldState } from '../state.ts';

/**
 * History-preserving undo (ADR 0006 §8). Undo of command C appends one
 * CommandUndone event restoring the exact values C replaced. It is rejected
 * when any later event of a still-effective command read or wrote a fact C
 * wrote; the blockers are listed so the DM can resolve them explicitly.
 */
const NOT_UNDOABLE: ReadonlySet<KernelCommandType> = new Set(['CreateCampaign', 'UndoCommand']);

export interface UndoBlocker {
  readonly commandId: string;
  readonly commandType: KernelCommandType;
  readonly sequence: number;
}

export function decideUndo(
  context: DecisionContext,
  command: ResolvedCommandOf<'UndoCommand'>,
): Decision {
  const { state, history } = context;
  const target = state.commands.get(command.targetCommandId);
  if (!target) {
    return reject('COMMAND_NOT_FOUND', `No accepted command "${command.targetCommandId}"`);
  }
  if (NOT_UNDOABLE.has(target.commandType)) {
    return reject('UNDO_NOT_SUPPORTED', `${target.commandType} cannot be undone`);
  }
  if (target.undoneBy !== null) {
    return reject('ALREADY_UNDONE', `Command "${target.commandId}" was already undone`, {
      undoneBy: target.undoneBy,
    });
  }

  const targetEvents = history.filter(
    (event) => event.sequence >= target.firstSequence && event.sequence <= target.lastSequence,
  );
  const written = new Set(targetEvents.flatMap((event) => footprintOf(event).writes));
  const blockers = findBlockers(state, history, target.lastSequence, written);
  if (blockers.length > 0) {
    return reject(
      'UNDO_UNSAFE',
      `Later commands depend on what "${target.commandId}" changed; undo them first`,
      { blockers },
    );
  }

  const before = replay(history, { untilSequence: target.firstSequence - 1 });
  const restores = restoresFor(targetEvents, before);
  // A command that changed no restorable fact (for example an inspection that
  // found nothing) has nothing to undo; an empty compensation is not an event.
  if (restores.length === 0) {
    return reject('NO_EFFECT', `Command "${target.commandId}" changed nothing that can be undone`);
  }
  return accept({
    type: 'CommandUndone',
    payload: {
      targetCommandId: target.commandId,
      targetCommandType: target.commandType,
      restores,
    },
  });
}

/**
 * Later events that depend on the written facts. Events of commands that
 * were themselves undone, and CommandUndone events, are ignored: each undone
 * command and its compensation cancel out.
 */
function findBlockers(
  state: WorldState,
  history: readonly RecordedEvent[],
  afterSequence: number,
  written: ReadonlySet<FactKey>,
): UndoBlocker[] {
  const blockers = new Map<string, UndoBlocker>();
  for (const event of history) {
    if (event.sequence <= afterSequence || event.type === 'CommandUndone') continue;
    const { commandId, commandType } = event.causation;
    if (blockers.has(commandId) || state.commands.get(commandId)?.undoneBy) continue;
    const { reads, writes } = footprintOf(event);
    if ([...reads, ...writes].some((fact) => written.has(fact))) {
      blockers.set(commandId, { commandId, commandType, sequence: event.sequence });
    }
  }
  return [...blockers.values()];
}

/** Exact prior values for every fact the target command wrote. */
function restoresFor(events: readonly RecordedEvent[], before: WorldState): Restore[] {
  const removedEntities = new Set<string>();
  const removedScenes = new Set<string>();
  const restores: Restore[] = [];
  const entityBefore = (entityId: string) => {
    const entity = before.entities.get(entityId);
    if (!entity) throw new Error(`entity ${entityId} missing before the undone command`);
    return entity;
  };

  for (const event of events) {
    switch (event.type) {
      case 'EntityCreated':
        removedEntities.add(event.payload.entityId);
        restores.push({ fact: 'entity', entityId: event.payload.entityId, value: null });
        break;
      case 'EntityPlaced':
        restores.push({
          fact: 'entity.placement',
          entityId: event.payload.entityId,
          value: before.entities.get(event.payload.entityId)?.placement ?? null,
        });
        break;
      case 'EntityProfileUpdated': {
        const { name, description } = entityBefore(event.payload.entityId);
        restores.push({
          fact: 'entity.profile',
          entityId: event.payload.entityId,
          value: { name, description },
        });
        break;
      }
      case 'EntityStatusChanged':
        restores.push({
          fact: 'entity.status',
          entityId: event.payload.entityId,
          value: entityBefore(event.payload.entityId).status,
        });
        break;
      case 'SceneStarted':
        removedScenes.add(event.payload.sceneId);
        restores.push({ fact: 'scene', sceneId: event.payload.sceneId, value: null });
        restores.push({ fact: 'world.activeScene', value: before.activeSceneId });
        break;
      case 'SceneEnded':
        restores.push({
          fact: 'scene.ended',
          sceneId: event.payload.sceneId,
          value: before.scenes.get(event.payload.sceneId)?.endedAt ?? null,
        });
        restores.push({ fact: 'world.activeScene', value: before.activeSceneId });
        break;
      case 'WorldTimeAdvanced':
        restores.push({ fact: 'world.clock', value: before.clock });
        break;
      case 'KnowledgeAssigned':
        restores.push({ fact: 'knowledge', knowledgeId: event.payload.knowledgeId, value: null });
        break;
      case 'MemoryRecorded':
        restores.push({ fact: 'memory', memoryId: event.payload.memoryId, value: null });
        break;
      case 'SessionStarted':
        removedScenes.add(event.payload.sessionId);
        restores.push({ fact: 'session', sessionId: event.payload.sessionId, value: null });
        restores.push({ fact: 'world.activeSession', value: before.activeSessionId });
        break;
      case 'SessionEnded':
        restores.push({
          fact: 'session.ended',
          sessionId: event.payload.sessionId,
          value: before.sessions.get(event.payload.sessionId)?.endedAt ?? null,
        });
        restores.push({ fact: 'world.activeSession', value: before.activeSessionId });
        break;
      case 'CharacterSheetSet':
        restores.push({
          fact: 'sheet',
          entityId: event.payload.entityId,
          value: before.characterSheets.get(event.payload.entityId) ?? null,
        });
        break;
      case 'CharacterAssigned':
        restores.push({
          fact: 'roster',
          characterId: event.payload.characterId,
          playerActorId: event.payload.playerActorId,
          value: null,
        });
        break;
      case 'ClueAdded':
        restores.push({ fact: 'clue', clueId: event.payload.clueId, value: null });
        break;
      case 'DisclosureSet':
        restores.push({
          fact: 'disclosure',
          knowledgeId: event.payload.knowledgeId,
          value: before.investigation.disclosures.get(event.payload.knowledgeId) ?? null,
        });
        break;
      case 'EvidenceExamined': {
        const { characterId, entityId, method, scope, roll, revealed } = event.payload;
        if (roll !== null) {
          restores.push({
            fact: 'attempt',
            key: attemptKey(characterId, entityId, method),
            value: null,
          });
        }
        for (const { clueId } of revealed) {
          restores.push({ fact: 'revealed', key: scopedKey(scope, clueId), value: null });
        }
        break;
      }
      case 'InformationShared':
        restores.push({
          fact: 'shared',
          key: scopedKey(event.payload.scope, event.payload.sourceKnowledgeId),
          value: null,
        });
        break;
      case 'ClaimSet':
        restores.push({ fact: 'claim', target: { ...event.payload.target }, value: null });
        break;
      case 'ContradictionDetected': {
        const { scope, between } = event.payload;
        restores.push({
          fact: 'contradiction',
          key: pairKey(scopeKey(scope), between[0], between[1]),
          value: null,
        });
        break;
      }
      case 'PremisesRecorded':
        // Reads only: nothing to restore.
        break;
      case 'CampaignCreated':
      case 'CommandUndone':
        throw new Error(`${event.type} is not undoable`);
    }
  }

  // Keep the first restore per fact; facets of removed entities/scenes go with them.
  const seen = new Set<string>();
  return restores.filter((restore) => {
    if (restore.fact.startsWith('entity.') && 'entityId' in restore) {
      if (removedEntities.has(restore.entityId)) return false;
    }
    if (restore.fact === 'scene.ended' && removedScenes.has(restore.sceneId)) return false;
    if (restore.fact === 'session.ended' && removedScenes.has(restore.sessionId)) return false;
    const key = restoredFacts(restore).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
