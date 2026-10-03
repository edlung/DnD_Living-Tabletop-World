import type { Decision, DecisionContext, ResolvedCommand } from '../decision.ts';
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

/** Routes a resolved, authorized command to its pure decision function. */
export function decide(context: DecisionContext, command: ResolvedCommand): Decision {
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
  }
}
