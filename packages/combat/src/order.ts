import { MAX_COMBATANTS, type KernelCommandOf } from '@ltw/contracts';
import {
  FRESH_TURN,
  accept,
  currentCombatant,
  reject,
  type CombatantRecord,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import { JOIN_REFUSALS, encounterOf, isAlive, joinRefusal } from './battlefield.ts';
import { FightWork, leftTheFight } from './condition-details.ts';
import { isObject, isObjectIn } from './objects.ts';
import { nextTurn } from './turns.ts';
import {
  incapacitated,
  initiativeModifier,
  rollInitiative,
  sizeOf,
  vitalsOf,
  withConditions,
} from './vitals.ts';

/**
 * A running fight changed by the DM (docs/adr/0043-dm-screen.md §2): a creature joins or leaves,
 * the current combatant delays its turn until after another's this round, or a combatant's
 * initiative is set. One `CombatOrderChanged` holds the whole new order and the turn's place; the
 * current turn stays with its combatant unless that one leaves or delays, and then passes on as
 * an ended turn would (a new round when it wraps).
 *
 * A changed combatant is placed by its total, after any already there with the same total; the
 * rest keep their order, so a delayed turn stays where it was put.
 */
type Change = 'joined' | 'left' | 'delayed' | 'initiative';

const invalid = (message: string) => reject('INVALID_ENCOUNTER', message);

const orderEvent = (
  change: Change,
  entityId: string,
  combatants: readonly CombatantRecord[],
  currentIndex: number,
): DraftEvent => ({
  type: 'CombatOrderChanged',
  payload: { change, entityId, combatants: [...combatants], currentIndex },
});

/** The order with the record placed by its total, after any already there with the same total. */
function placed(order: readonly CombatantRecord[], record: CombatantRecord): CombatantRecord[] {
  const at = order.findIndex((c) => c.initiative.total < record.initiative.total);
  const index = at === -1 ? order.length : at;
  return [...order.slice(0, index), record, ...order.slice(index)];
}

/** Where the current combatant now stands in the new order. */
const indexOf = (order: readonly CombatantRecord[], entityId: string | undefined) =>
  order.findIndex((c) => c.entityId === entityId);

/**
 * A total the DM names (a physical roll, a feature the statistics do not show): the total is the
 * DM's word; the d20 recorded is what the total implies, within a die's faces.
 */
const namedInitiative = (total: number, modifier: number) => ({
  roll: Math.min(20, Math.max(1, total - modifier)),
  modifier,
  total,
});

export function decideAddCombatant(
  context: DecisionContext,
  command: KernelCommandOf<'AddCombatant'>,
  dice: Dice,
): Decision {
  const { state } = context;
  const found = encounterOf(state);
  if (!found.ok) return found;
  const encounter = found.value;
  const entity = state.entities.get(command.entityId);
  if (!entity || !isAlive(state, command.entityId))
    return invalid('Combatants must exist and be alive');
  if (encounter.combatants.some((c) => c.entityId === command.entityId))
    return invalid('Each combatant may appear once');
  if (entity.placement?.locationId !== encounter.locationId)
    return invalid('Combatants must be at the location');
  if (encounter.combatants.length >= MAX_COMBATANTS)
    return invalid('The fight holds as many combatants as it can');
  const vitals = vitalsOf(state, command.entityId);
  if (!vitals) return reject('NO_STAT_BLOCK', 'Every combatant needs a sheet or a stat block');
  const space = { position: command.position, size: sizeOf(vitals) };
  const refused = joinRefusal(state, encounter, space, command.entityId);
  if (refused !== null) return invalid(JOIN_REFUSALS[refused]);
  // An object rolls no initiative: it joins with `AddObject` (docs/adr/0048-hit-points.md §5).
  if (isObject(vitals)) return invalid('An object joins the fight as an object');
  const rolled = command.initiative === undefined ? rollInitiative(dice, vitals) : null;
  const initiative =
    rolled === null
      ? namedInitiative(command.initiative ?? 0, initiativeModifier(vitals))
      : { ...rolled, total: rolled.roll + rolled.modifier };
  const record: CombatantRecord = {
    entityId: command.entityId,
    side: command.side,
    position: { ...command.position },
    initiative,
    turn: { ...FRESH_TURN },
    slowedBy: null,
  };
  const current = currentCombatant(encounter)?.entityId;
  const order = placed(encounter.combatants, record);
  return accept(orderEvent('joined', command.entityId, order, indexOf(order, current)));
}

export function decideRemoveCombatant(
  context: DecisionContext,
  command: KernelCommandOf<'RemoveCombatant'>,
  dice: Dice,
): Decision {
  const { state } = context;
  const found = encounterOf(state);
  if (!found.ok) return found;
  const encounter = found.value;
  if (!encounter.combatants.some((c) => c.entityId === command.entityId))
    return reject('NOT_A_COMBATANT', 'NOT_A_COMBATANT');
  const events = departureEvents(state, encounter, command.entityId, dice);
  return events === null ? invalid('End the fight instead') : accept(...events);
}

/**
 * A combatant leaving the running fight, or null when the fight could not go on without it (two
 * left, or none of the rest alive): the DM's removal, a summoned creature gone (docs/adr/0056-…md
 * §5). Its conditions on others end, and a turn that was its own passes on.
 */
export function departureEvents(
  state: WorldState,
  encounter: EncounterState,
  entityId: string,
  dice: Dice,
): DraftEvent[] | null {
  const leaving = encounter.combatants.findIndex((c) => c.entityId === entityId);
  if (leaving === -1) return [];
  if (encounter.combatants.length <= 2) return null;
  const events: DraftEvent[] = [];
  // Slowed by the one who leaves ends now: its turn will not come to end it. Nor will a condition
  // that lasts until its turn (docs/adr/0045-conditions-and-actions.md §2).
  const work = new FightWork(
    state,
    encounter.combatants.filter((c) => c.entityId !== entityId),
  );
  for (const c of [...work.combatants]) {
    if (c.slowedBy !== entityId) continue;
    const slowed = work.vitalsOf(c.entityId);
    if (slowed) {
      events.push(
        {
          type: 'ConditionApplied',
          payload: { targetId: c.entityId, condition: 'slowed', applied: false, cause: 'left' },
        },
        work.vitals(withConditions(slowed, [], ['slowed'])),
      );
    }
    work.record({ ...c, slowedBy: null });
  }
  // Nor will the turn that ends its Sap, and Vex against it has no one left to hit (ADR 0047 §2).
  for (const c of [...work.combatants]) {
    if (c.sappedBy !== entityId && c.vexing?.targetId !== entityId) continue;
    const kept = { ...c };
    if (kept.sappedBy === entityId) delete kept.sappedBy;
    if (kept.vexing?.targetId === entityId) delete kept.vexing;
    work.record(kept);
  }
  events.push(...leftTheFight(work, entityId));
  const order = [...work.combatants];
  if (!order.some((c) => isAlive(state, c.entityId))) return null;
  if (leaving !== encounter.currentIndex) {
    const current = currentCombatant(encounter)?.entityId;
    return [...events, orderEvent('left', entityId, order, indexOf(order, current))];
  }
  // The one whose turn it was leaves: the turn passes to whoever followed.
  const changed: EncounterState = { ...encounter, combatants: order, currentIndex: leaving - 1 };
  return [
    ...events,
    orderEvent('left', entityId, order, leaving - 1),
    ...nextTurn(state, changed, leaving - 1, dice),
  ];
}

export function decideDelayTurn(
  context: DecisionContext,
  command: KernelCommandOf<'DelayTurn'>,
  dice: Dice,
): Decision {
  const { state } = context;
  const found = encounterOf(state);
  if (!found.ok) return found;
  const encounter = found.value;
  const index = encounter.currentIndex;
  const delaying = encounter.combatants[index];
  if (delaying?.entityId !== command.combatantId)
    return reject('NOT_YOUR_TURN', 'Not this combatant’s turn');
  const { turn } = delaying;
  // Only a turn not begun: nothing spent (its start already happened and will not again).
  if (
    turn.actionUsed ||
    turn.bonusActionUsed ||
    turn.movementUsedFt > 0 ||
    turn.slotExpendedThisTurn
  )
    return reject('ILLEGAL_ACTION', 'TURN_BEGUN', { reason: 'TURN_BEGUN' });
  const vitals = vitalsOf(state, command.combatantId);
  if (!vitals || incapacitated(vitals))
    return reject('ILLEGAL_ACTION', 'INCAPACITATED', { reason: 'INCAPACITATED' });
  const after = encounter.combatants.findIndex((c) => c.entityId === command.afterId);
  // Later this round, and someone who will act.
  if (after <= index || !isAlive(state, command.afterId))
    return reject('ILLEGAL_ACTION', 'NOT_LATER_THIS_ROUND', { reason: 'NOT_LATER_THIS_ROUND' });
  const target = encounter.combatants[after];
  if (!target) return reject('NOT_A_COMBATANT', 'NOT_A_COMBATANT');
  const moved: CombatantRecord = {
    ...delaying,
    initiative: { ...delaying.initiative, total: target.initiative.total },
  };
  const rest = encounter.combatants.filter((c) => c.entityId !== command.combatantId);
  const at = rest.findIndex((c) => c.entityId === command.afterId) + 1;
  const order = [...rest.slice(0, at), moved, ...rest.slice(at)];
  const changed: EncounterState = { ...encounter, combatants: order, currentIndex: index - 1 };
  return accept(
    orderEvent('delayed', command.combatantId, order, index - 1),
    ...nextTurn(state, changed, index - 1, dice),
  );
}

export function decideSetInitiative(
  context: DecisionContext,
  command: KernelCommandOf<'SetInitiative'>,
): Decision {
  const { state } = context;
  const found = encounterOf(state);
  if (!found.ok) return found;
  const encounter = found.value;
  const record = encounter.combatants.find((c) => c.entityId === command.combatantId);
  if (!record) return reject('NOT_A_COMBATANT', 'NOT_A_COMBATANT');
  if (isObjectIn(state, record.entityId)) return reject('NO_EFFECT', 'An object has no initiative');
  if (record.initiative.total === command.total) return reject('NO_EFFECT', 'Nothing changes');
  // The DM's total: the recorded roll and modifier stay as they were.
  const initiative = { ...record.initiative, total: command.total };
  const current = currentCombatant(encounter)?.entityId;
  const order = placed(
    encounter.combatants.filter((c) => c.entityId !== command.combatantId),
    { ...record, initiative },
  );
  return accept(orderEvent('initiative', command.combatantId, order, indexOf(order, current)));
}
