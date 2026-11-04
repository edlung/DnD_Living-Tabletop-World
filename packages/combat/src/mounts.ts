import type { KernelCommandOf, KernelCommandType, Square } from '@ltw/contracts';
import {
  accept,
  combatantOf,
  foldDrafts,
  type CombatantRecord,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import { sizeRank, squaresOf } from '@ltw/rules';

import { combatantEvent, gapBetween, isAlive, placedOf, turnStateOf } from './battlefield.ts';
import type { Refusal } from './legality.ts';
import { combatPremises } from './refusal.ts';
import { spellSave } from './saves.ts';
import { fitAt } from './space.ts';
import {
  has,
  incapacitated,
  sizeOf,
  speedOf,
  vitalsEvent,
  vitalsOf,
  withConditions,
  type Vitals,
} from './vitals.ts';

/**
 * Mounted combat (SRD 5.2.1; docs/adr/0049-space-and-movement.md §10). Once a move a creature
 * mounts a willing one at least a size larger within 5 ft, or gets down within 5 ft of it, for
 * half its Speed. The rider shares its mount's space and goes where it goes. A mount its rider's
 * player commands (ADR 0044 §7) acts right after the rider and only dashes, disengages or dodges;
 * another keeps its own turn. A rider knocked Prone, or whose mount is moved against its will,
 * makes a DC 10 Dexterity save or falls off Prone within 5 ft; a mount that falls Prone, is
 * Incapacitated or dies throws its rider, who lands on its feet with its Reaction, Prone without.
 */
export const SADDLE_DC = 10;

/** The rider on a mount, if one rides it. */
export const riderOf = (encounter: EncounterState, mountId: string): CombatantRecord | undefined =>
  encounter.combatants.find((c) => c.mountedOn === mountId);

/** A mount its own rider commands: the rider's word moves it (ADR 0044 §7). */
export function controlledMount(encounter: EncounterState, mount: CombatantRecord): boolean {
  const rider = riderOf(encounter, mount.entityId);
  return rider !== undefined && (mount.commandedBy ?? null) === rider.entityId;
}

const refuse = (reason: Refusal['reason']): Refusal => ({ legal: false, reason });

export interface MountPlan {
  readonly legal: true;
  readonly rider: CombatantRecord;
  readonly mount: CombatantRecord;
  /** Where it lands, getting down. */
  readonly square: Square | null;
  readonly costFt: number;
}

/** Half its Speed, and only once a move: what mounting or getting down costs. */
function halfSpeed(
  encounter: EncounterState,
  rider: CombatantRecord,
  vitals: Vitals,
): number | Refusal {
  const turn = turnStateOf(encounter, rider);
  if (!turn.ownTurn) return refuse('NOT_YOUR_TURN');
  if (rider.turn.mounting === true) return refuse('MOUNTED_THIS_TURN');
  const speed = speedOf(vitals) + (rider.turn.dashFt ?? 0);
  const cost = Math.floor(speedOf(vitals) / 2 / 5) * 5;
  if (speedOf(vitals) === 0 || rider.turn.movementUsedFt + cost > speed) {
    return refuse('NOT_ENOUGH_MOVEMENT');
  }
  return cost;
}

/** The squares within 5 ft of the mount's space where the rider could stand, nearest first. */
export function landingSquares(
  state: WorldState,
  encounter: EncounterState,
  rider: CombatantRecord,
  mount: CombatantRecord,
): Square[] {
  const afoot: CombatantRecord = { ...rider };
  delete afoot.mountedOn;
  const space = squaresOf(placedOf(state, mount));
  const around: Square[] = [];
  for (const square of space)
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const at = { x: square.x + dx, y: square.y + dy };
        const known = around.some((one) => one.x === at.x && one.y === at.y);
        const inside = space.some((one) => one.x === at.x && one.y === at.y);
        if (!known && !inside) around.push(at);
      }
  return around.filter((at) => fitAt(state, encounter, afoot, at, true) !== null);
}

export function mountPlan(
  state: WorldState,
  encounter: EncounterState,
  rider: CombatantRecord,
  vitals: Vitals,
  request: {
    readonly action: 'mount' | 'dismount';
    readonly targetId?: string | undefined;
    readonly square?: Square | undefined;
  },
): MountPlan | Refusal {
  if (request.action === 'dismount') {
    const mount =
      rider.mountedOn === undefined ? undefined : combatantOf(encounter, rider.mountedOn);
    if (!mount) return refuse('NOT_MOUNTED');
    const cost = halfSpeed(encounter, rider, vitals);
    if (typeof cost !== 'number') return cost;
    const free = landingSquares(state, encounter, rider, mount);
    const square = request.square
      ? free.find((at) => at.x === request.square?.x && at.y === request.square.y)
      : free[0];
    if (!square) return refuse('DESTINATION_INVALID');
    return { legal: true, rider, mount, square, costFt: cost };
  }
  if (rider.mountedOn !== undefined) return refuse('MOUNTED');
  if (request.targetId === undefined) return refuse('TARGET_REQUIRED');
  const mount = combatantOf(encounter, request.targetId);
  const steed = mount ? vitalsOf(state, mount.entityId) : null;
  if (!mount || !steed || mount.entityId === rider.entityId) return refuse('NOT_A_COMBATANT');
  if (!isAlive(state, mount.entityId)) return refuse('TARGET_DEAD');
  if (steed.kind === 'creature' && steed.block.object !== undefined) {
    return refuse('NOT_A_CREATURE');
  }
  // Willing: on its side, or a creature its rider commands.
  if (mount.side !== rider.side && (mount.commandedBy ?? null) !== rider.entityId) {
    return refuse('NOT_WILLING');
  }
  if (incapacitated(steed)) return refuse('NOT_WILLING');
  if (sizeRank(sizeOf(steed)) < sizeRank(sizeOf(vitals)) + 1) return refuse('MOUNT_TOO_SMALL');
  if (riderOf(encounter, mount.entityId) || mount.mountedOn !== undefined) {
    return refuse('MOUNT_TAKEN');
  }
  if (gapBetween(state, rider, mount) > 5) return refuse('OUT_OF_RANGE');
  const cost = halfSpeed(encounter, rider, vitals);
  if (typeof cost !== 'number') return cost;
  return { legal: true, rider, mount, square: null, costFt: cost };
}

/** Mounting or getting down: the rider's record, and a controlled mount's place in the order. */
export function decideMounting(
  context: DecisionContext,
  command: KernelCommandOf<'TakeAction'>,
  plan: MountPlan,
): Decision {
  const { state } = context;
  const encounter = state.encounter;
  if (!encounter) throw new Error('mounting outside a fight');
  const { rider, mount } = plan;
  const turn = {
    ...rider.turn,
    movementUsedFt: rider.turn.movementUsedFt + plan.costFt,
    mounting: true as const,
  };
  const events: DraftEvent[] = [
    combatPremises(state, command.combatantId),
    {
      type: 'ActionTaken',
      payload: {
        combatantId: command.combatantId,
        action: command.action,
        targetId: mount.entityId,
      },
    },
  ];
  if (command.action === 'dismount' && plan.square) {
    const afoot: CombatantRecord = { ...rider, turn, position: { ...plan.square } };
    delete afoot.mountedOn;
    delete afoot.altitudeFt;
    return accept(...events, combatantEvent(afoot));
  }
  const seated: CombatantRecord = {
    ...rider,
    turn,
    position: { ...mount.position },
    mountedOn: mount.entityId,
  };
  delete seated.squeezed;
  events.push(combatantEvent(seated));
  // A mount its rider commands takes the rider's initiative: it acts right after it.
  if ((mount.commandedBy ?? null) === rider.entityId) {
    const riderAt = encounter.combatants.findIndex((c) => c.entityId === rider.entityId);
    const moved = { ...mount, initiative: { ...mount.initiative, total: rider.initiative.total } };
    const rest = encounter.combatants
      .map((c) => (c.entityId === rider.entityId ? seated : c))
      .filter((c) => c.entityId !== mount.entityId);
    const at = rest.findIndex((c) => c.entityId === rider.entityId) + 1;
    const order = [...rest.slice(0, at), moved, ...rest.slice(at)];
    const mountAt = encounter.combatants.findIndex((c) => c.entityId === mount.entityId);
    const currentIndex = encounter.currentIndex - (mountAt < riderAt ? 1 : 0);
    events.push({
      type: 'CombatOrderChanged',
      payload: { change: 'mounted', entityId: mount.entityId, combatants: order, currentIndex },
    });
  }
  return accept(...events);
}

/** The rider goes where its mount went: the mount's record after its move. */
export function carryRider(encounter: EncounterState, mount: CombatantRecord): DraftEvent[] {
  const rider = riderOf(encounter, mount.entityId);
  if (!rider) return [];
  const carried: CombatantRecord = { ...rider, position: { ...mount.position } };
  delete carried.altitudeFt;
  return [
    combatantEvent(
      mount.altitudeFt === undefined ? carried : { ...carried, altitudeFt: mount.altitudeFt },
    ),
  ];
}

/** Off the mount, landing within 5 ft of it: Prone, or on its feet with its Reaction spent. */
function offTheMount(
  state: WorldState,
  encounter: EncounterState,
  rider: CombatantRecord,
  vitals: Vitals,
  mount: CombatantRecord | undefined,
  feet: boolean,
  cause: string,
): DraftEvent[] {
  const square = mount ? landingSquares(state, encounter, rider, mount)[0] : undefined;
  const off: CombatantRecord = {
    ...rider,
    ...(square ? { position: { ...square } } : {}),
    ...(feet ? { turn: { ...rider.turn, reactionAvailable: false } } : {}),
  };
  delete off.mountedOn;
  delete off.altitudeFt;
  const events: DraftEvent[] = [combatantEvent(off)];
  if (!feet && !has(vitals, 'prone') && isAlive(state, rider.entityId)) {
    events.push(
      {
        type: 'ConditionApplied',
        payload: { targetId: rider.entityId, condition: 'prone', applied: true, cause },
      },
      vitalsEvent(withConditions(vitals, ['prone'], [])),
    );
  }
  return events;
}

/**
 * After every fight command, the riders' seats (§10): a mount down, Prone or gone throws its
 * rider; a rider knocked Prone, or left behind by a mount moved against its will, saves or falls.
 * Nothing moves while a reaction window waits: its close comes back here.
 */
export function ridersAfter(
  context: DecisionContext,
  commandType: KernelCommandType,
  decision: Decision,
  dice: Dice,
): Decision {
  if (!decision.ok) return decision;
  if (decision.events.some((event) => event.type === 'ReactionWindowOpened')) return decision;
  const touched = decision.events.some(
    (event) =>
      event.type === 'CombatantUpdated' ||
      event.type === 'ConditionApplied' ||
      event.type === 'DamageApplied' ||
      event.type === 'EntityStatusChanged',
  );
  if (!touched) return decision;
  const state = foldDrafts(context, commandType, decision.events);
  const encounter = state.encounter;
  if (!encounter || !encounter.combatants.some((c) => c.mountedOn !== undefined)) return decision;
  const events: DraftEvent[] = [];
  for (const rider of encounter.combatants) {
    if (rider.mountedOn === undefined) continue;
    const vitals = vitalsOf(state, rider.entityId);
    if (!vitals) continue;
    const mount = combatantOf(encounter, rider.mountedOn);
    const steed = mount ? vitalsOf(state, mount.entityId) : null;
    const thrown =
      !mount ||
      !steed ||
      !isAlive(state, mount.entityId) ||
      has(steed, 'prone') ||
      incapacitated(steed);
    if (thrown || !isAlive(state, rider.entityId)) {
      const ready = turnStateOf(encounter, rider).reactionAvailable && !incapacitated(vitals);
      events.push(
        ...offTheMount(
          state,
          encounter,
          rider,
          vitals,
          mount,
          ready && isAlive(state, rider.entityId),
          'thrown',
        ),
      );
      continue;
    }
    const leftBehind =
      rider.position.x !== mount.position.x || rider.position.y !== mount.position.y;
    if (!leftBehind && !has(vitals, 'prone')) continue;
    const save = spellSave(dice, vitals, 'dex', SADDLE_DC, 'none', 'saddle');
    events.push(save.event);
    if (!save.success) {
      events.push(...offTheMount(state, encounter, rider, vitals, mount, false, 'fell-off'));
      continue;
    }
    // In the saddle still: on its feet, where the mount is.
    if (has(vitals, 'prone')) {
      events.push(
        {
          type: 'ConditionApplied',
          payload: {
            targetId: rider.entityId,
            condition: 'prone',
            applied: false,
            cause: 'saddle',
          },
        },
        vitalsEvent(withConditions(vitals, [], ['prone'])),
      );
    }
    if (leftBehind) events.push(...carryRider(encounter, mount));
  }
  return events.length === 0 ? decision : { ...decision, events: [...decision.events, ...events] };
}
