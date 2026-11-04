import { PLAYER_COMMAND_TYPES } from '@ltw/contracts';

import { decideCreateCharacter } from '../../character/create.ts';
import { decideBootstrapCampaign } from '../../campaign/bootstrap.ts';
import { decideApplyAuthoring } from '../../authoring/decide.ts';
import { decideSetCharacterSheet } from '../../character/character.ts';
import { decideSetStatBlock } from '../../combat/authoring.ts';
import { poolDice } from '../../combat/port.ts';
import { decideSetClaim } from '../../contradiction/decide.ts';
import { withContradictions } from '../../contradiction/detect.ts';
import {
  decideAlignBattleMap,
  decideApproveAsset,
  decideCancelAssetRequest,
  decideCompleteAssetJob,
  decideFailAssetJob,
  decideRequestAsset,
  decideRetractAsset,
  decideStartAssetJob,
} from '../../assets/decide.ts';
import { decideSetWeather } from '../../weather/weather.ts';
import { decideSetCampaignOptions } from '../../campaign/options.ts';
import { decideAskPortrait } from '../../assets/portrait-wishes.ts';
import { decideGenerateChronicle } from '../../chronicle/decide.ts';
import { decideAddClue, decideSetDisclosure } from '../../investigation/authoring.ts';
import { decideAskAbout } from '../../investigation/conversation.ts';
import { decideInsightCheck } from '../../investigation/insight.ts';
import { decideShowEvidence } from '../../investigation/show.ts';
import { decideExamineEntity } from '../../investigation/examine.ts';
import {
  decideEnterLocation,
  decideFormHypothesis,
} from '../../investigation/movement-and-hypotheses.ts';
import {
  decideAddKnowledge,
  decideAssignCharacter,
  decideReleaseCharacter,
} from '../../knowledge/decide.ts';
import { decideEndSession, decideRecordMemory, decideStartSession } from '../../memory/decide.ts';
import {
  decideDropItem,
  decideEquipItem,
  decideGiveItem,
  decideAttuneItem,
  decideDawnRecharge,
  decideIdentifyItem,
  decideGrantItem,
  decideTakeItem,
  decideUnequipItem,
  decideUseItem,
} from '../../items/decide.ts';
import { decideSetRelationship } from '../../relationships/decide.ts';
import { commanderOf } from '../authorization.ts';
import { accept, type Decision, type DecisionContext, type ResolvedCommand } from '../decision.ts';
import type { KernelEvent } from '../events.ts';
import {
  decideChangeEntityStatus,
  decideCreateEntity,
  decidePlaceEntity,
  decideUpdateEntityProfile,
} from './entities.ts';
import { pausedByChanges, pausedCombat } from './reaction-pause.ts';
import { decideUndo } from './undo.ts';
import {
  decideAdvanceWorldTime,
  decideCreateCampaign,
  decideEndScene,
  decideStartScene,
} from './world.ts';
import { decideSplitCoins } from '../../items/coins.ts';
import { decideBuyItem, decideSellItem, decideSetMerchant } from '../../items/trade.ts';
import {
  decideAbandonCrafting,
  decideStartCrafting,
  decideWorkDowntime,
} from '../../items/crafting-decide.ts';
import { decideSetMapPins, decideSetRoute } from '../../travel/map.ts';
import { decideSetQuest, decideSetQuestStep } from '../../quest/hand-quests.ts';

/**
 * Routes a resolved, authorized command to its pure decision function, then
 * records any contradictions the accepted events create (ADR 0014). A player
 * command must record its premises; when a controlling player issued it,
 * that authorization is one of them (Gate 02, G02-H03). While a reaction
 * window is open, the pause rule applies to every command (ADR 0016).
 * Authoring decisions also state the consent their commit needs (ADR 0018).
 */
export function decide(context: DecisionContext, command: ResolvedCommand): Decision {
  const waiting = pausedCombat(context.state, command);
  if (waiting) return waiting;
  const decision = route(context, command);
  if (!decision.ok) return decision;
  const events = PLAYER_TYPES.has(command.type)
    ? withAuthorityPremise(context, command.type, decision.events)
    : decision.events;
  const all = withContradictions(context.state, events, context.commandId);
  const paused = pausedByChanges(context.state, command.type, all);
  if (paused) return paused;
  // Authoring states the consent its commit needs (ADR 0018 §4).
  if (decision.requiresBootstrap)
    return { ok: true, events: all, requiresBootstrap: decision.requiresBootstrap };
  return decision.requires
    ? { ok: true, events: all, requires: decision.requires }
    : accept(...all);
}

const PLAYER_TYPES: ReadonlySet<string> = new Set(PLAYER_COMMAND_TYPES);

function withAuthorityPremise(
  context: DecisionContext,
  commandType: string,
  events: readonly KernelEvent[],
): KernelEvent[] {
  const index = events.findIndex((event) => event.type === 'PremisesRecorded');
  const recorded = events[index];
  if (recorded?.type !== 'PremisesRecorded') {
    throw new Error(`${commandType} was accepted without recording its premises`);
  }
  if (context.authority !== 'controller' && context.authority !== 'commander') return [...events];
  // A commander acts for a creature their character commands (ADR 0044 §7).
  const commander =
    context.authority === 'commander'
      ? commanderOf(context.state, recorded.payload.characterId)
      : null;
  const withController: KernelEvent = {
    type: 'PremisesRecorded',
    payload: {
      characterId: recorded.payload.characterId,
      premises: [
        ...recorded.payload.premises,
        commander === null
          ? { kind: 'controller', playerActorId: context.actor.actorId }
          : { kind: 'commander', characterId: commander, playerActorId: context.actor.actorId },
      ],
    },
  };
  return events.map((event, position) => (position === index ? withController : event));
}

function route(context: DecisionContext, command: ResolvedCommand): Decision {
  const { state } = context;
  switch (command.type) {
    case 'BootstrapCampaign':
      return decideBootstrapCampaign(context, command);
    case 'CreateCampaign':
      return decideCreateCampaign(context, command);
    case 'CreateEntity':
      return decideCreateEntity(state, command);
    case 'PlaceEntity':
      return decidePlaceEntity(state, command);
    case 'UpdateEntityProfile':
      return decideUpdateEntityProfile(state, command);
    case 'ChangeEntityStatus':
      return decideChangeEntityStatus(state, command);
    case 'StartScene':
      return decideStartScene(state, command);
    case 'EndScene':
      return decideEndScene(state, command);
    case 'AdvanceWorldTime':
      return decideAdvanceWorldTime(state, command);
    case 'UndoCommand':
      return decideUndo(context, command);
    case 'AddKnowledge':
      return decideAddKnowledge(state, command);
    case 'AssignCharacter':
      return decideAssignCharacter(state, command);
    case 'ReleaseCharacter':
      return decideReleaseCharacter(state, command);
    case 'RecordMemory':
      return decideRecordMemory(context, command);
    case 'StartSession':
      return decideStartSession(state, command);
    case 'EndSession':
      return decideEndSession(state, command);
    case 'SetCharacterSheet':
      return decideSetCharacterSheet(state, command);
    case 'AddClue':
      return decideAddClue(state, command);
    case 'SetDisclosure':
      return decideSetDisclosure(state, command);
    case 'EnterLocation':
      return decideEnterLocation(state, command);
    case 'AskAbout':
      return decideAskAbout(state, command);
    case 'ShowEvidence':
      return decideShowEvidence(state, command);
    case 'InsightCheck':
      return decideInsightCheck(context, command);
    case 'ExamineEntity':
      return decideExamineEntity(context, command);
    case 'FormHypothesis':
      return decideFormHypothesis(state, command);
    case 'SetClaim':
      return decideSetClaim(state, command);
    case 'SetStatBlock':
      return decideSetStatBlock(state, command);
    case 'ApplyAuthoring':
      return decideApplyAuthoring(context, command);
    case 'SetRelationship':
      return decideSetRelationship(state, command);
    case 'CreateCharacter':
      return decideCreateCharacter(context, command);
    case 'GrantItem':
      return decideGrantItem(state, command);
    case 'AttuneItem':
      return decideAttuneItem(state, command);
    case 'IdentifyItem':
      return decideIdentifyItem(state, command);
    case 'DawnRecharge':
      return decideDawnRecharge(state, command);
    case 'EquipItem':
      return decideEquipItem(state, command);
    case 'UnequipItem':
      return decideUnequipItem(state, command);
    case 'UseItem':
      return decideUseItem(state, command);
    case 'GiveItem':
      return decideGiveItem(state, command);
    case 'SplitCoins':
      return decideSplitCoins(state, command);
    case 'SetMerchant':
      return decideSetMerchant(state, command);
    case 'BuyItem':
      return decideBuyItem(state, command);
    case 'SellItem':
      return decideSellItem(state, command);
    case 'StartCrafting':
      return decideStartCrafting(context, command);
    case 'AbandonCrafting':
      return decideAbandonCrafting(state, command);
    case 'WorkDowntime':
      return decideWorkDowntime(context, command);
    case 'SetMapPins':
      return decideSetMapPins(state, command);
    case 'SetRoute':
      return decideSetRoute(state, command);
    case 'SetQuest':
      return decideSetQuest(state, command);
    case 'SetQuestStep':
      return decideSetQuestStep(state, command);
    case 'DropItem':
      return decideDropItem(state, command);
    case 'TakeItem':
      return decideTakeItem(state, command);
    case 'RequestAsset':
      return decideRequestAsset(state, context.commandId, command);
    case 'StartAssetJob':
      return decideStartAssetJob(state, command);
    case 'CompleteAssetJob':
      return decideCompleteAssetJob(state, command);
    case 'FailAssetJob':
      return decideFailAssetJob(state, command);
    case 'CancelAssetRequest':
      return decideCancelAssetRequest(state, command);
    case 'RetractAsset':
      return decideRetractAsset(state, command);
    case 'ApproveAsset':
      return decideApproveAsset(state, command);
    case 'AlignBattleMap':
      return decideAlignBattleMap(state, command);
    case 'SetWeather':
      return decideSetWeather(state, command);
    case 'SetCampaignOptions':
      return decideSetCampaignOptions(state, command);
    case 'AskPortrait':
      return decideAskPortrait(state, command);
    case 'GenerateChronicle':
      return decideGenerateChronicle(context, command);
    case 'StartCombat':
    case 'MoveCombatant':
    case 'Attack':
    case 'CastSpell':
    case 'UseCreatureAction':
    case 'TakeAction':
    case 'MakeReadiedAttack':
    case 'SpendInspiration':
    case 'UseFeature':
    case 'EndTurn':
    case 'EndCombat':
    case 'UseReaction':
    case 'DeclineReaction':
    case 'CloseReactionWindow':
    case 'AdjustHitPoints':
    case 'SetCondition':
    case 'SetExhaustion':
    case 'SetInspiration':
    case 'AddCombatant':
    case 'RemoveCombatant':
    case 'DelayTurn':
    case 'SetInitiative':
    case 'PlaceCombatant':
    case 'PaintTerrain':
    case 'SetFog':
    case 'CommandCreature':
    case 'AddObject':
    case 'SetLight':
    case 'ExposeToHazard':
    case 'SpringTrap':
    case 'InflictMentalStress':
    case 'InfectWithContagion':
    case 'ContagionCourse':
    case 'Travel': {
      if (!context.combat) throw new Error(`${command.type} needs the combat engine port`);
      // A condition by hand stored before Stage 640f carries no resolution.
      const entropy = 'resolution' in command ? command.resolution.entropy : [];
      return context.combat.decide(context, command, poolDice(entropy));
    }
  }
}
