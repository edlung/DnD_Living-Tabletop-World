import {
  FRESH_TURN,
  accept,
  reject,
  type CombatCommand,
  type CombatantRecord,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
} from '@ltw/domain';
import { initiativeOrder } from '@ltw/rules';

import { encounterOf, isAlive } from './battlefield.ts';
import { FightWork, fightEnded } from './condition-details.ts';
import { firstTurn } from './turns.ts';
import { dexterity, rollInitiative, vitalsOf, withConditions } from './vitals.ts';

/**
 * Starting and ending an encounter (docs/adr/0015-combat-engine.md §1–2).
 * Only the DM or the system issues these (authorization is the engine's).
 */
type StartCombat = Extract<CombatCommand, { type: 'StartCombat' }>;
type EndCombat = Extract<CombatCommand, { type: 'EndCombat' }>;

const invalid = (message: string) => reject('INVALID_ENCOUNTER', message);
const key = (s: { x: number; y: number }) => `${String(s.x)},${String(s.y)}`;

export function decideStartCombat(
  context: DecisionContext,
  command: StartCombat,
  dice: Dice,
): Decision {
  const { state } = context;
  if (state.encounter) return reject('COMBAT_ALREADY_ACTIVE', 'An encounter is already running');
  const encounterId = command.encounterId;
  if (encounterId === undefined) throw new Error('StartCombat resolved without an encounter ID');
  if (state.usedIds.has(encounterId))
    return reject('ID_ALREADY_USED', `ID "${encounterId}" was already used`);
  const location = state.entities.get(command.locationId);
  if (location?.kind !== 'location') return invalid('The encounter needs an existing location');
  const { battlefield } = command;
  const inside = (s: { x: number; y: number }) =>
    s.x < battlefield.width && s.y < battlefield.height;
  if (![...battlefield.difficult, ...battlefield.cover].every(inside)) {
    return invalid('Terrain lies outside the battlefield');
  }
  const ids = command.combatants.map((c) => c.entityId);
  if (new Set(ids).size !== ids.length) return invalid('Each combatant may appear once');
  if (new Set(command.combatants.map((c) => key(c.position))).size !== ids.length) {
    return invalid('Two combatants cannot share a square');
  }
  const entries = [];
  for (const combatant of command.combatants) {
    const entity = state.entities.get(combatant.entityId);
    if (!entity || !isAlive(state, combatant.entityId))
      return invalid('Combatants must exist and be alive');
    if (entity.placement?.locationId !== command.locationId)
      return invalid('Combatants must be at the location');
    if (!inside(combatant.position)) return invalid('A combatant stands outside the battlefield');
    const vitals = vitalsOf(state, combatant.entityId);
    if (!vitals) return reject('NO_STAT_BLOCK', 'Every combatant needs a sheet or a stat block');
    const { roll, modifier } = rollInitiative(dice, vitals, combatant.surprised === true);
    entries.push({
      id: combatant.entityId,
      total: roll + modifier,
      dexterity: dexterity(vitals),
      combatant,
      roll,
      modifier,
    });
  }
  const combatants: CombatantRecord[] = initiativeOrder(entries).map((e) => ({
    entityId: e.id,
    side: e.combatant.side,
    position: { ...e.combatant.position },
    initiative: {
      roll: e.roll,
      modifier: e.modifier,
      total: e.total,
      ...(e.combatant.surprised === true ? { surprised: true as const } : {}),
    },
    turn: { ...FRESH_TURN },
    slowedBy: null,
  }));
  const encounter = {
    encounterId,
    locationId: command.locationId,
    round: 0,
    currentIndex: -1,
    battlefield: structuredClone(battlefield),
    combatants,
  };
  return accept(
    { type: 'CombatStarted', payload: encounter },
    ...firstTurn(context, encounter, dice),
  );
}

export function decideEndCombat(context: DecisionContext, command: EndCombat): Decision {
  const { state } = context;
  const encounter = encounterOf(state);
  if (!encounter.ok) return encounter;
  if (encounter.value.encounterId !== command.encounterId)
    return reject('NOT_IN_COMBAT', 'No such encounter');
  // Slowed lasts only until a turn that will no longer come; a condition with a duration or a
  // save ends with the fight (docs/adr/0045-conditions-and-actions.md §2).
  const work = new FightWork(state, encounter.value.combatants);
  const events: DraftEvent[] = [];
  for (const combatant of encounter.value.combatants) {
    if (combatant.slowedBy === null) continue;
    const vitals = work.vitalsOf(combatant.entityId);
    if (vitals) {
      events.push(
        {
          type: 'ConditionApplied',
          payload: {
            targetId: combatant.entityId,
            condition: 'slowed',
            applied: false,
            cause: 'combat-ended',
          },
        },
        work.vitals(withConditions(vitals, [], ['slowed'])),
      );
    }
    events.push(work.record({ ...combatant, slowedBy: null }));
  }
  events.push(...fightEnded(work));
  return accept(...events, { type: 'CombatEnded', payload: { encounterId: command.encounterId } });
}
