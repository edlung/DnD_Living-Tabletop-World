import { ASSET_SETTLING_COMMAND_TYPES, type KernelCommandType } from '@ltw/contracts';

import { assetHoldBlockers } from '../../assets/hold.ts';
import { assetRestores } from '../../assets/undo.ts';

import {
  accept,
  reject,
  type Decision,
  type DecisionContext,
  type ResolvedCommandOf,
} from '../decision.ts';
import { writtenEarlier } from '../event-versions.ts';
import type { RecordedEvent, Restore } from '../events.ts';
import { replay } from '../evolve.ts';
import { facts, type FactKey } from '../fact-keys.ts';
import { footprintOf, restoredFacts } from '../facts.ts';
import { reopeningBlockers } from '../../combat/reaction-undo.ts';
import { pairKey } from '../../contradiction/records.ts';
import { attemptKey, insightKey, scopedKey, shownKey } from '../../investigation/records.ts';
import { scopeKey } from '../../knowledge/records.ts';
import type { WorldState } from '../state.ts';

/**
 * History-preserving undo (ADR 0006 §8). Undo of command C appends one
 * CommandUndone event restoring the exact values C replaced. It is rejected
 * when any later event of a still-effective command read or wrote a fact C
 * wrote; the blockers are listed so the DM can resolve them explicitly.
 *
 * A command an earlier writer decided (its events carry an earlier schema
 * version) may rest on facts its records do not name. It rests on everything
 * before it: while it stands nothing beneath it can be undone, so history
 * from earlier versions comes off only from its end backwards (owner
 * decision, ADR 0006 Gate 03 retest 3 amendment; G03-H07).
 *
 * A release (`ReleaseCharacter`, docs/adr/0036-production-sign-in.md §4) is
 * likewise undone only from the end of history: a later command may rest on
 * the seat being empty (a party memory listing its witnesses, the DM acting
 * for the character outside the party), which no footprint records, so every
 * later still-effective command blocks it.
 */
const NOT_UNDOABLE: ReadonlySet<KernelCommandType> = new Set([
  'CreateCampaign',
  'BootstrapCampaign',
  'UndoCommand',
  // What settles external asset work is final (ADR 0006 §9, ADR 0022).
  ...ASSET_SETTLING_COMMAND_TYPES,
]);

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
  // The target also wrote its own standing: a record citing its events (a
  // chapter telling one) rests on it even when it changed no other fact
  // (Gate 05, G05-H02).
  const written = new Set([
    facts.command(target.commandId),
    ...targetEvents.flatMap((event) => footprintOf(event).writes),
  ]);
  const blockers = withoutDuplicates([
    ...findBlockers(
      state,
      history,
      target.lastSequence,
      written,
      target.commandType === 'ReleaseCharacter',
    ),
    // Reopening a reaction window must keep every later command legal (ADR 0016 §3).
    ...reopeningBlockers(state, history, targetEvents),
    // A started asset job cannot be recalled (ADR 0006 §9).
    ...assetHoldBlockers(state, history, targetEvents),
  ]);
  if (blockers.length > 0) {
    return reject(
      'UNDO_UNSAFE',
      `Later commands depend on what "${target.commandId}" changed; undo them first`,
      { blockers },
    );
  }

  const before = replay(history, { untilSequence: target.firstSequence - 1 });
  // A command that changed no restorable fact (for example an inspection that
  // found nothing) is still undoable: the compensation restores nothing but
  // takes the command out of current canon, so it stops holding read
  // dependencies (Gate 02, G02-M01). History keeps its events.
  const restores = restoresFor(targetEvents, before);
  return accept({
    type: 'CommandUndone',
    payload: {
      targetCommandId: target.commandId,
      targetCommandType: target.commandType,
      restores,
    },
  });
}

const withoutDuplicates = (blockers: readonly UndoBlocker[]): UndoBlocker[] => [
  ...new Map(blockers.map((blocker) => [blocker.commandId, blocker])).values(),
];

/**
 * Later events that depend on the written facts, or whose command an earlier
 * writer decided (or every later one, for a target later commands may rest on
 * wholly). Events of commands that were themselves undone, and CommandUndone
 * events, are ignored: each undone command and its compensation cancel out,
 * and a compensation's own footprint is exact for any writer.
 */
function findBlockers(
  state: WorldState,
  history: readonly RecordedEvent[],
  afterSequence: number,
  written: ReadonlySet<FactKey>,
  everything: boolean,
): UndoBlocker[] {
  const blockers = new Map<string, UndoBlocker>();
  for (const event of history) {
    if (event.sequence <= afterSequence || event.type === 'CommandUndone') continue;
    const { commandId, commandType } = event.causation;
    if (blockers.has(commandId) || state.commands.get(commandId)?.undoneBy) continue;
    const { reads, writes } = footprintOf(event);
    if (
      everything ||
      writtenEarlier(event) ||
      [...reads, ...writes].some((fact) => written.has(fact))
    ) {
      blockers.set(commandId, { commandId, commandType, sequence: event.sequence });
    }
  }
  return [...blockers.values()];
}

/**
 * Exact prior values for every fact the target command wrote. An entity the command created
 * (an authoring commit may create an NPC and then edit him) had no earlier facets: removing it
 * restores them all, so its later edits in the same command restore nothing of their own.
 */
function restoresFor(events: readonly RecordedEvent[], before: WorldState): Restore[] {
  const removedEntities = new Set(
    events.flatMap((event) => (event.type === 'EntityCreated' ? [event.payload.entityId] : [])),
  );
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
        if (removedEntities.has(event.payload.entityId)) break;
        const { name, description } = entityBefore(event.payload.entityId);
        restores.push({
          fact: 'entity.profile',
          entityId: event.payload.entityId,
          value: { name, description },
        });
        break;
      }
      case 'EntityStatusChanged':
        if (removedEntities.has(event.payload.entityId)) break;
        restores.push(
          {
            fact: 'entity.status',
            entityId: event.payload.entityId,
            value: entityBefore(event.payload.entityId).status,
          },
          {
            fact: 'death',
            entityId: event.payload.entityId,
            value: before.deaths.get(event.payload.entityId) ?? null,
          },
        );
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
      case 'CharacterReleased': {
        const { characterId, playerActorId } = event.payload;
        const assignedAt = before.rosterAssignedAt.get(characterId);
        if (assignedAt === undefined)
          throw new Error(`${characterId} had no assignment to restore`);
        restores.push({ fact: 'release', characterId, playerActorId, assignedAt, value: null });
        break;
      }
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
      case 'EvidenceShown': {
        const { scope, npcId, subjects } = event.payload;
        for (const subjectId of subjects) {
          restores.push({ fact: 'shown', key: shownKey(scope, npcId, subjectId), value: null });
        }
        break;
      }
      case 'InsightChecked':
        restores.push({
          fact: 'attempt',
          key: insightKey(event.payload.characterId, event.payload.npcId),
          value: null,
        });
        break;
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
      case 'AuthoringPremisesRecorded':
      case 'ActionTaken':
      case 'FeatureUsed':
      case 'AttackPerformed':
      case 'WeaponMasteryApplied':
      case 'SpellCast':
      case 'DamageApplied':
      case 'HealingApplied':
      case 'HitPointsAdjusted':
      case 'SavingThrowRolled':
      case 'CheckRolled':
      case 'RechargeRolled':
      case 'CreatureActionUsed':
      case 'ConditionApplied':
      case 'DeathSaveRolled':
        // Reads only: nothing to restore.
        break;
      case 'CombatStarted':
      case 'TurnStarted':
      case 'CombatantUpdated':
      case 'CombatOrderChanged':
      case 'LightSet':
      case 'TerrainPainted':
      case 'FogSet':
      case 'TrapChanged':
      case 'CombatEnded':
        restores.push({
          fact: 'encounter',
          value: before.encounter ? structuredClone(before.encounter) : null,
        });
        break;
      case 'ReactionWindowOpened':
      case 'ReactionUsed':
      case 'ReactionDeclined':
      case 'ReactionWindowExpired':
      case 'ReactionWindowResolved':
      case 'ReactionWindowWaiting':
      case 'ReactionWindowResumed': {
        const windowId =
          event.type === 'ReactionWindowOpened'
            ? event.payload.window.windowId
            : event.payload.windowId;
        const prior = before.reactionWindows.get(windowId);
        restores.push({
          fact: 'reactionWindow',
          windowId,
          value: prior ? structuredClone(prior) : null,
        });
        break;
      }
      case 'ChronicleGenerated':
        restores.push({ fact: 'chronicle', chronicleId: event.payload.chronicleId, value: null });
        break;
      case 'CampaignOptionsSet':
        restores.push({ fact: 'campaignOptions', value: event.payload.from });
        break;
      case 'WeatherSet':
        restores.push({
          fact: 'weather',
          locationId: event.payload.locationId,
          value: before.weather.get(event.payload.locationId) ?? null,
        });
        break;
      case 'ItemSplit':
        restores.push(
          {
            fact: 'possession',
            itemId: event.payload.itemId,
            holderId: null,
            value: before.possessions.get(event.payload.itemId) ?? null,
          },
          { fact: 'possession', itemId: event.payload.newItemId, holderId: null, value: null },
        );
        break;
      case 'ItemGranted':
      case 'ItemEquipped':
      case 'ItemUnequipped':
      case 'ItemUsed':
      case 'ItemStackChanged':
      case 'ItemRecovered':
      case 'ItemTransferred':
      case 'ItemAttuned':
      case 'ItemChargesSpent':
      case 'ItemChargesRegained':
      case 'ItemIdentified':
        restores.push({
          fact: 'possession',
          itemId: event.payload.itemId,
          holderId: 'holderId' in event.payload ? event.payload.holderId : null,
          value: before.possessions.get(event.payload.itemId) ?? null,
        });
        break;
      case 'RelationshipChanged':
        restores.push({
          fact: 'relationship',
          npcId: event.payload.npcId,
          value: before.relationships.get(event.payload.npcId) ?? null,
        });
        break;
      case 'StatBlockSet':
        restores.push({
          fact: 'statblock',
          entityId: event.payload.entityId,
          value: before.statBlocks.get(event.payload.entityId) ?? null,
        });
        break;
      // An NPC's shop (docs/adr/0057-encounters-maps-loot.md §8).
      case 'MerchantSet':
        restores.push({
          fact: 'merchant',
          npcId: event.payload.npcId,
          value: before.merchants.get(event.payload.npcId) ?? null,
        });
        break;
      case 'AssetRequested':
      case 'PortraitAsked':
      case 'AssetApproved':
      case 'BattleMapAligned':
        restores.push(...assetRestores(before, event));
        break;
      case 'AssetJobStarted':
      case 'AssetGenerated':
      case 'AssetJobFailed':
      case 'AssetRequestCancelled':
      case 'AssetRetracted':
      case 'PreparedPartyEstablished':
      case 'CampaignBootstrapped':
      case 'AssetAdopted':
      case 'CampaignCreated':
      case 'CommandUndone':
        throw new Error(`${event.type} is not undoable`);
      default: {
        // Every event type is named above: one left out would undo without restoring anything.
        const unnamed: never = event;
        throw new Error(`no undo restore for ${(unnamed as { type: string }).type}`);
      }
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
