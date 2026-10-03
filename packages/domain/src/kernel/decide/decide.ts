import { decideSetCharacterSheet } from '../../character/character.ts';
import { decideSetClaim } from '../../contradiction/decide.ts';
import { withContradictions } from '../../contradiction/detect.ts';
import { decideAddClue, decideSetDisclosure } from '../../investigation/authoring.ts';
import { decideAskAbout } from '../../investigation/conversation.ts';
import { decideExamineEntity } from '../../investigation/examine.ts';
import {
  decideEnterLocation,
  decideFormHypothesis,
} from '../../investigation/movement-and-hypotheses.ts';
import { decideAddKnowledge, decideAssignCharacter } from '../../knowledge/decide.ts';
import { decideEndSession, decideRecordMemory, decideStartSession } from '../../memory/decide.ts';
import { accept, type Decision, type DecisionContext, type ResolvedCommand } from '../decision.ts';
import {
  decideChangeEntityStatus,
  decideCreateEntity,
  decidePlaceEntity,
  decideUpdateEntityProfile,
} from './entities.ts';
import { decideUndo } from './undo.ts';
import {
  decideAdvanceWorldTime,
  decideCreateCampaign,
  decideEndScene,
  decideStartScene,
} from './world.ts';

/**
 * Routes a resolved, authorized command to its pure decision function, then
 * records any contradictions the accepted events create (ADR 0014).
 */
export function decide(context: DecisionContext, command: ResolvedCommand): Decision {
  const decision = route(context, command);
  return decision.ok ? accept(...withContradictions(context.state, decision.events)) : decision;
}

function route(context: DecisionContext, command: ResolvedCommand): Decision {
  const { state } = context;
  switch (command.type) {
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
    case 'ExamineEntity':
      return decideExamineEntity(context, command);
    case 'FormHypothesis':
      return decideFormHypothesis(state, command);
    case 'SetClaim':
      return decideSetClaim(state, command);
  }
}
