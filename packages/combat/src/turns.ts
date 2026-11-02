import {
  accept,
  encounterAfterTurnStart,
  type CombatCommand,
  type CombatantRecord,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import { rollDeathSave } from '@ltw/rules';

import { encounterOf, isAlive, onTurn } from './battlefield.ts';
import { durationsAt, FightWork, savesAtEndOfTurn } from './condition-details.ts';
import { combatPremises } from './refusal.ts';
import {
  hitPoints,
  withConditions,
  withHitPoints,
  withSheet,
  withoutDeathSaves,
} from './vitals.ts';

/**
 * Turn order and the start of a turn (docs/adr/0015-combat-engine.md §2, §4):
 * the dead are skipped; Slowed set by the creature whose turn starts ends;
 * a dying character makes its death saving throw. A condition's own save and
 * its duration count at the end and the start of turns
 * (docs/adr/0045-conditions-and-actions.md §2).
 */
type EndTurn = Extract<CombatCommand, { type: 'EndTurn' }>;

export function decideEndTurn(context: DecisionContext, command: EndTurn, dice: Dice): Decision {
  const { state } = context;
  const encounter = encounterOf(state);
  if (!encounter.ok) return encounter;
  const current = onTurn(encounter.value, command.combatantId);
  if (!current.ok) return current;
  // The end of its turn: its saves against its conditions, then what lasts until the end of its
  // turn ends (docs/adr/0045-conditions-and-actions.md §2).
  const work = new FightWork(state, encounter.value.combatants);
  const ending = [
    ...savesAtEndOfTurn(work, dice, command.combatantId),
    ...durationsAt(work, command.combatantId, 'end'),
  ];
  const ended = work.encounter(encounter.value);
  const next = nextLiving(state, ended, ended.currentIndex);
  const round = next.wrapped ? ended.round + 1 : ended.round;
  return accept(
    combatPremises(state, command.combatantId),
    ...ending,
    ...turnStart(work, ended, next.combatant, round, dice),
  );
}

/**
 * The turn after `fromIndex` in this order (a new round when it wraps): its start's events. A
 * running fight the DM changed passes the turn on with it (docs/adr/0043-dm-screen.md §2).
 */
export function nextTurn(
  state: WorldState,
  encounter: EncounterState,
  fromIndex: number,
  dice: Dice,
): DraftEvent[] {
  const next = nextLiving(state, encounter, fromIndex);
  const round = next.wrapped ? encounter.round + 1 : encounter.round;
  return turnStart(
    new FightWork(state, encounter.combatants),
    encounter,
    next.combatant,
    round,
    dice,
  );
}

/** The first turn of a new encounter. */
export function firstTurn(
  context: DecisionContext,
  encounter: EncounterState,
  dice: Dice,
): DraftEvent[] {
  const first = nextLiving(context.state, encounter, -1);
  const work = new FightWork(context.state, encounter.combatants);
  return turnStart(work, encounter, first.combatant, 1, dice);
}

function nextLiving(
  state: WorldState,
  encounter: EncounterState,
  fromIndex: number,
): { combatant: CombatantRecord; wrapped: boolean } {
  const count = encounter.combatants.length;
  for (let step = 1; step <= count; step += 1) {
    const index = (fromIndex + step) % count;
    const combatant = encounter.combatants[index];
    if (combatant && isAlive(state, combatant.entityId)) {
      return { combatant, wrapped: fromIndex >= 0 && fromIndex + step >= count };
    }
  }
  throw new Error('an encounter always has its current combatant');
}

function turnStart(
  work: FightWork,
  encounter: EncounterState,
  combatant: CombatantRecord,
  round: number,
  dice: Dice,
): DraftEvent[] {
  const after = encounterAfterTurnStart(encounter, combatant.entityId, round);
  if (!after) throw new Error('turn of a non-combatant');
  work.rebase(after.combatants);
  const events: DraftEvent[] = [
    { type: 'TurnStarted', payload: { combatantId: combatant.entityId, round } },
  ];

  // Slowed (Longbow mastery) ends at the start of the slowing creature's turn.
  for (const other of [...work.combatants]) {
    if (other.slowedBy !== combatant.entityId) continue;
    const vitals = work.vitalsOf(other.entityId);
    if (vitals) {
      events.push(
        {
          type: 'ConditionApplied',
          payload: {
            targetId: other.entityId,
            condition: 'slowed',
            applied: false,
            cause: 'slow-ended',
          },
        },
        work.vitals(withConditions(vitals, [], ['slowed'])),
      );
    }
    events.push(work.record({ ...(work.combatant(other.entityId) ?? other), slowedBy: null }));
  }

  // What lasts until the start of this combatant's turn ends (ADR 0045 §2).
  events.push(...durationsAt(work, combatant.entityId, 'start'));

  // A dying character rolls its death saving throw (SRD 5.2.1).
  const vitals = work.vitalsOf(combatant.entityId);
  if (vitals?.kind === 'character' && hitPoints(vitals).current === 0) {
    const saves = vitals.sheet.deathSaves ?? { successes: 0, failures: 0 };
    if (saves.successes < 3) {
      const result = rollDeathSave(dice, saves);
      events.push({
        type: 'DeathSaveRolled',
        payload: {
          characterId: combatant.entityId,
          roll: result.roll,
          ...result.saves,
          outcome: result.outcome,
        },
      });
      if (result.outcome === 'revived') {
        const revived = withoutDeathSaves(
          withConditions(withHitPoints(vitals, 1), [], ['unconscious']),
        );
        events.push(
          {
            type: 'ConditionApplied',
            payload: {
              targetId: combatant.entityId,
              condition: 'unconscious',
              applied: false,
              cause: 'death-save',
            },
          },
          work.vitals(revived),
        );
      } else {
        events.push(
          work.vitals(withSheet(vitals, (sheet) => ({ ...sheet, deathSaves: result.saves }))),
        );
        if (result.outcome === 'dead') {
          events.push({
            type: 'EntityStatusChanged',
            payload: { entityId: combatant.entityId, from: 'active', to: 'dead' },
          });
        }
      }
    }
  }
  return events;
}
