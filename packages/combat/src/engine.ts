import type { CombatCommand, CombatPort, Decision, DecisionContext, Dice } from '@ltw/domain';

import { decideTakeAction } from './actions.ts';
import { decideAttack } from './attack.ts';
import { decideCommandCreature } from './commanded.ts';
import {
  decideAdjustHitPoints,
  decideSetCondition,
  decideSetExhaustion,
  decideSetInspiration,
  decideSpendInspiration,
} from './hand.ts';
import {
  decideAddCombatant,
  decideDelayTurn,
  decideRemoveCombatant,
  decideSetInitiative,
} from './order.ts';
import { decideMove } from './movement.ts';
import { decideMakeReadiedAttack } from './readied.ts';
import {
  decideCloseReactionWindow,
  decideDeclineReaction,
  decideUseReaction,
} from './reactions/respond.ts';
import { decideCastSpell } from './spells.ts';
import { decideEndCombat, decideStartCombat } from './start-end.ts';
import { decideEndTurn } from './turns.ts';

/**
 * The Combat Engine (docs/adr/0015-combat-engine.md): the domain's
 * `CombatPort`, injected into the World Engine by the composition root.
 */
export function createCombatEngine(): CombatPort {
  return {
    decide(context: DecisionContext, command: CombatCommand, dice: Dice): Decision {
      switch (command.type) {
        case 'StartCombat':
          return decideStartCombat(context, command, dice);
        case 'MoveCombatant':
          return decideMove(context, command);
        case 'Attack':
          return decideAttack(context, command, dice);
        case 'CastSpell':
          return decideCastSpell(context, command, dice);
        case 'TakeAction':
          return decideTakeAction(context, command, dice);
        case 'MakeReadiedAttack':
          return decideMakeReadiedAttack(context, command, dice);
        case 'EndTurn':
          return decideEndTurn(context, command, dice);
        case 'EndCombat':
          return decideEndCombat(context, command);
        case 'UseReaction':
          return decideUseReaction(context, command, dice);
        case 'DeclineReaction':
          return decideDeclineReaction(context, command, dice);
        case 'CloseReactionWindow':
          return decideCloseReactionWindow(context, command, dice);
        case 'AdjustHitPoints':
          return decideAdjustHitPoints(context, command, dice);
        case 'SetCondition':
          return decideSetCondition(context, command);
        case 'SetExhaustion':
          return decideSetExhaustion(context, command);
        case 'SetInspiration':
          return decideSetInspiration(context, command);
        case 'SpendInspiration':
          return decideSpendInspiration(context, command);
        case 'AddCombatant':
          return decideAddCombatant(context, command, dice);
        case 'RemoveCombatant':
          return decideRemoveCombatant(context, command, dice);
        case 'DelayTurn':
          return decideDelayTurn(context, command, dice);
        case 'SetInitiative':
          return decideSetInitiative(context, command);
        case 'CommandCreature':
          return decideCommandCreature(context, command);
      }
    },
  };
}
