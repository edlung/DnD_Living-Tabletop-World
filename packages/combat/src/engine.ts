import type { CombatCommand, CombatPort, Decision, DecisionContext, Dice } from '@ltw/domain';

import { decideTakeAction } from './actions.ts';
import { decidePlaceCombatant } from './board-hand.ts';
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
import { decideUseCreatureAction } from './creature-actions.ts';
import { decideExposeToHazard } from './hazards.ts';
import { decideUseFeature } from './features.ts';
import { decideInflictMentalStress, decideSpringTrap } from './toolbox.ts';
import { decideContagionCourse, decideInfectWithContagion } from './contagions.ts';
import { decideSetLight } from './light.ts';
import { decidePaintTerrain } from './terrain-paint.ts';
import { decideMove } from './movement.ts';
import { ridersAfter } from './mounts.ts';
import { decideAddObject } from './objects.ts';
import { decideMakeReadiedAttack } from './readied.ts';
import {
  decideCloseReactionWindow,
  decideDeclineReaction,
  decideUseReaction,
} from './reactions/respond.ts';
import { decideCastSpell } from './spells.ts';
import { decideEndCombat, decideStartCombat } from './start-end.ts';
import { summonsAfter } from './summons.ts';
import { shapesAfter } from './wild-shape.ts';
import { decideEndTurn } from './turns.ts';

/**
 * The Combat Engine (docs/adr/0015-combat-engine.md): the domain's
 * `CombatPort`, injected into the World Engine by the composition root.
 */
export function createCombatEngine(): CombatPort {
  return {
    decide(context: DecisionContext, command: CombatCommand, dice: Dice): Decision {
      // The summoned creatures that go and the Wild Shape forms that end (docs/adr/0056-
      // characters-from-the-srd.md §5), then the riders' seats after what the command did
      // (docs/adr/0049-space-and-movement.md §10).
      const decided = shapesAfter(
        context,
        command.type,
        summonsAfter(context, command.type, decideCommand(context, command, dice), dice),
      );
      return ridersAfter(context, command.type, decided, dice);
    },
  };
}

function decideCommand(context: DecisionContext, command: CombatCommand, dice: Dice): Decision {
  switch (command.type) {
    case 'StartCombat':
      return decideStartCombat(context, command, dice);
    case 'MoveCombatant':
      return decideMove(context, command, dice);
    case 'Attack':
      return decideAttack(context, command, dice);
    case 'CastSpell':
      return decideCastSpell(context, command, dice);
    case 'UseCreatureAction':
      return decideUseCreatureAction(context, command, dice);
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
      return decideSetCondition(context, command, dice);
    case 'SetExhaustion':
      return decideSetExhaustion(context, command);
    case 'SetInspiration':
      return decideSetInspiration(context, command);
    case 'SpendInspiration':
      return decideSpendInspiration(context, command);
    case 'UseFeature':
      return decideUseFeature(context, command, dice);
    case 'AddCombatant':
      return decideAddCombatant(context, command, dice);
    case 'RemoveCombatant':
      return decideRemoveCombatant(context, command, dice);
    case 'DelayTurn':
      return decideDelayTurn(context, command, dice);
    case 'SetInitiative':
      return decideSetInitiative(context, command);
    case 'PlaceCombatant':
      return decidePlaceCombatant(context, command);
    case 'CommandCreature':
      return decideCommandCreature(context, command);
    case 'AddObject':
      return decideAddObject(context, command);
    case 'SetLight':
      return decideSetLight(context, command);
    case 'PaintTerrain':
      return decidePaintTerrain(context, command);
    case 'ExposeToHazard':
      return decideExposeToHazard(context, command, dice);
    case 'SpringTrap':
      return decideSpringTrap(context, command, dice);
    case 'InflictMentalStress':
      return decideInflictMentalStress(context, command, dice);
    case 'InfectWithContagion':
      return decideInfectWithContagion(context, command, dice);
    case 'ContagionCourse':
      return decideContagionCourse(context, command, dice);
  }
}
