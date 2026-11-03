import type { PathStep, Square } from '@ltw/contracts';
import {
  REACTION_WINDOW_ID_INDEX,
  accept,
  combatantOf,
  type CombatantRecord,
  type CombatCommand,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type EncounterState,
  type ReactionWindowRecord,
  type WorldState,
} from '@ltw/domain';
import { gapFt } from '@ltw/rules';

import { combatantEvent, encounterOf, isAlive, onTurn, placedOf, withTurn } from './battlefield.ts';
import { groundHarm, groundWalked, springTrap, trapStep } from './board-traps.ts';
import { sourceOf } from './condition-details.ts';
import { landingEvents } from './falling.ts';
import { carryRider } from './mounts.ts';
import { fallMoment } from './reactions/fall-window.ts';
import type { Refusal } from './legality.ts';
import { firstProvocation } from './reactions/opportunity.ts';
import { refused, combatPremises } from './refusal.ts';
import { pathPlan } from './steps.ts';
import { dragged, heldBy } from './unarmed.ts';
import {
  has,
  incapacitated,
  speedOf,
  vitalsEvent,
  vitalsOf,
  wayOfSpeed,
  withConditions,
  type Vitals,
} from './vitals.ts';

/**
 * `MoveCombatant` (docs/adr/0015-combat-engine.md §3): step by step from the current square, its
 * whole space within the battlefield and clear of walls; through an ally's space, an Incapacitated
 * creature's, a Tiny one's or one two sizes apart as Difficult Terrain, never ending in another's;
 * squeezing where a Large or larger creature fits only a size smaller; on foot, climbing, swimming,
 * flying, burrowing, jumping or dropping, each step against the speed of its way
 * (docs/adr/0049-space-and-movement.md §1–8). Difficult terrain costs double; standing up from
 * Prone costs half Speed, crawling an extra foot per foot instead. Leaving a hostile creature's
 * reach provokes an opportunity attack (docs/adr/0046-reactions-beyond-counterspell.md §2): the
 * move stops there while the window is open, and goes on after. Coming onto an armed trap stops the
 * move there and springs it; harmful ground harms on the way (docs/adr/0057-…md §6).
 */
type Move = Extract<CombatCommand, { type: 'MoveCombatant' }>;

export interface MovePlan {
  readonly legal: true;
  readonly vitals: Vitals;
  /** Half Speed to stand up from Prone first, or 0. */
  readonly standUpFt: number;
  /** Movement used this turn once the move is made. */
  readonly usedFt: number;
  /** Squeezed into a space a size smaller where the move ends (ADR 0049 §4). */
  readonly squeezed: boolean;
  /** Its height above the ground where the move ends (§6). */
  readonly altitudeFt: number;
  /** The feet it falls at the move's end, 0 when none (§8). */
  readonly fallFt: number;
  /** Steps a jump lands on in Difficult Terrain (§7). */
  readonly landings: readonly number[];
}

/**
 * Whether the combatant on its turn may move along `path` now. Shared by the decision and the
 * DM's monster suggestions (docs/adr/0020-npc-intelligence.md §5).
 */
export function movePlan(
  state: WorldState,
  encounter: EncounterState,
  mover: CombatantRecord,
  path: readonly PathStep[],
  crawl = false,
): MovePlan | Refusal {
  const vitals = vitalsOf(state, mover.entityId);
  if (!vitals) return { legal: false, reason: 'NOT_A_COMBATANT' };
  if (!isAlive(state, mover.entityId)) return { legal: false, reason: 'ACTOR_DEAD' };
  if (incapacitated(vitals)) return { legal: false, reason: 'INCAPACITATED' };
  // A rider goes where its mount goes; it gets down first to walk (ADR 0049 §10).
  if (mover.mountedOn !== undefined) return { legal: false, reason: 'MOUNTED' };
  // A Prone creature crawls instead of standing up, when it says so (ADR 0049 §5).
  const crawling = crawl && has(vitals, 'prone');
  const plan = pathPlan(state, encounter, mover, vitals, path, crawling);
  if ('legal' in plan) return plan;
  // A Frightened creature cannot move closer to the source of its fear, at any step
  // (docs/adr/0045-conditions-and-actions.md §1).
  const fear = has(vitals, 'frightened') ? sourceOf(mover, 'frightened') : null;
  const source = fear === null ? undefined : combatantOf(encounter, fear);
  if (source && isAlive(state, source.entityId)) {
    const its = placedOf(state, source);
    const here = (square: Square) => ({ ...placedOf(state, mover), position: square });
    let distance = gapFt(here(mover.position), its);
    for (const square of path) {
      const next = gapFt(here(square), its);
      if (next < distance) return { legal: false, reason: 'CLOSER_TO_FEAR' };
      distance = next;
    }
  }
  const standUpFt = has(vitals, 'prone') && !crawling ? Math.floor(speedOf(vitals) / 10) * 5 : 0;
  // Dragging a creature it grapples, each foot costs another (docs/adr/0047-weapons.md §3).
  const drag = heldBy(state, encounter, mover.entityId).length > 0 ? 2 : 1;
  // Every foot this turn counts against the speed of the way it moves now (ADR 0049 §5); Dash
  // adds the Speed once more (docs/adr/0045-conditions-and-actions.md §5).
  let usedFt = mover.turn.movementUsedFt + standUpFt;
  for (const step of plan.steps) {
    usedFt += step.feet * drag;
    if (usedFt > wayOfSpeed(vitals, step.way) + (mover.turn.dashFt ?? 0))
      return { legal: false, reason: 'NOT_ENOUGH_MOVEMENT' };
  }
  if (plan.steps.length === 0 && usedFt > speedOf(vitals) + (mover.turn.dashFt ?? 0))
    return { legal: false, reason: 'NOT_ENOUGH_MOVEMENT' };
  return {
    legal: true,
    vitals,
    standUpFt,
    usedFt,
    squeezed: plan.squeezed,
    altitudeFt: plan.altitudeFt,
    fallFt: plan.fallFt,
    landings: plan.landings,
  };
}

export function decideMove(context: DecisionContext, command: Move, dice: Dice): Decision {
  const { state } = context;
  const encounter = encounterOf(state);
  if (!encounter.ok) return encounter;
  const mover = onTurn(encounter.value, command.combatantId);
  if (!mover.ok) return mover;
  const crawl = command.crawl === true;
  const plan = movePlan(state, encounter.value, mover.value, command.path, crawl);
  if (!plan.legal) return refused(plan);
  const ids = command.resolution?.ids ?? [];
  return accept(
    combatPremises(state, command.combatantId),
    ...walk(context, state, encounter.value, mover.value, command.path, ids, dice, crawl),
  );
}

/**
 * Walks `path` (legal as a whole) for the mover on its turn: stands it up first if Prone and not
 * crawling, moves it step by step, and stops on the last square inside a reach it would leave
 * while someone may react — the window opens there with the rest of the path (ADR 0046 §2). A
 * jump's landing in Difficult Terrain asks its check; a drop at the end falls (ADR 0049 §7–8).
 */
function walk(
  context: DecisionContext,
  state: WorldState,
  encounter: EncounterState,
  mover: CombatantRecord,
  path: readonly PathStep[],
  ids: readonly string[],
  dice: Dice,
  crawl: boolean,
  offered = false,
): DraftEvent[] {
  const whole = movePlan(state, encounter, mover, path, crawl);
  if (!whole.legal) throw new Error(`a walk on an illegal path (${whole.reason})`);
  const events: DraftEvent[] = [];
  let vitals = whole.vitals;
  if (whole.standUpFt > 0) {
    vitals = withConditions(vitals, [], ['prone']);
    events.push(
      {
        type: 'ConditionApplied',
        payload: {
          targetId: mover.entityId,
          condition: 'prone',
          applied: false,
          cause: 'stood-up',
        },
      },
      vitalsEvent(vitals),
    );
  }
  const along = new Set(heldBy(state, encounter, mover.entityId).map((c) => c.entityId));
  const provoked = firstProvocation(state, encounter, mover, path, offered, along);
  // An armed trap on the way ends the move on it, before any reach further on (ADR 0057 §6).
  const trapped = trapStep(state, encounter, mover, path);
  const caught = trapped !== null && (provoked === null || trapped.index < provoked.walked);
  const stop = caught ? null : provoked;
  const walked = caught
    ? path.slice(0, trapped.index + 1)
    : stop === null
      ? path
      : path.slice(0, stop.walked);
  let usedFt = mover.turn.movementUsedFt + whole.standUpFt;
  let squeezed = mover.squeezed === true;
  let altitudeFt = mover.altitudeFt ?? 0;
  let landings: readonly number[] = [];
  if (walked.length > 0) {
    const part = movePlan(state, encounter, mover, walked, crawl);
    if (!part.legal) throw new Error(`a walked part became illegal (${part.reason})`);
    ({ usedFt, squeezed, altitudeFt, landings } = part);
  }
  const at = walked[walked.length - 1] ?? mover.position;
  // Squeezed where it stands, or whole again; its height there (docs/adr/0049-space-and-movement.md
  // §4, §6).
  const moved: CombatantRecord = {
    ...withTurn(mover, { ...mover.turn, movementUsedFt: usedFt }),
    position: { x: at.x, y: at.y },
  };
  delete moved.squeezed;
  delete moved.altitudeFt;
  events.push(
    combatantEvent({
      ...moved,
      ...(squeezed ? { squeezed: true as const } : {}),
      ...(altitudeFt === 0 ? {} : { altitudeFt }),
    }),
    // The creature it grapples comes along behind it; its rider rides along (§10).
    ...dragged(state, encounter, mover.entityId, [mover.position, ...walked]),
    ...carryRider(encounter, {
      ...moved,
      ...(altitudeFt === 0 ? {} : { altitudeFt }),
    }),
  );
  // Landing a jump in Difficult Terrain, and the fall a drop ends with (§7–8).
  for (let left = landings.length; left > 0; left -= 1) {
    const landed = landingEvents(dice, vitals);
    events.push(...landed.events);
    vitals = landed.vitals;
  }
  // Harmful ground on the way, then the trap it came onto (ADR 0057 §6).
  let harmed = { vitals, events: [] as DraftEvent[], dead: false };
  for (const hazard of groundWalked(state, encounter, mover, walked))
    harmed = groundHarm(state, dice, harmed, hazard);
  events.push(...harmed.events);
  vitals = harmed.vitals;
  if (caught) {
    events.push(
      ...springTrap(state, encounter, dice, trapped.trap, moved, harmed.dead ? null : vitals),
    );
    return events;
  }
  if (stop === null && whole.fallFt > 0) {
    // Feather Fall's moment, or the ground now (§8).
    const landed = { ...moved, ...(squeezed ? { squeezed: true as const } : {}) };
    events.push(
      ...fallMoment(context, state, dice, ids, [{ record: landed, vitals, feet: whole.fallFt }]),
    );
  }
  if (stop === null) return events;
  const windowId = ids[REACTION_WINDOW_ID_INDEX];
  if (windowId === undefined) throw new Error('a provoking move resolved without a window ID');
  const window: ReactionWindowRecord = {
    windowId,
    encounterId: encounter.encounterId,
    round: encounter.round,
    status: 'open',
    trigger: {
      kind: 'move',
      moverId: mover.entityId,
      at: { x: at.x, y: at.y },
      rest: path.slice(stop.walked),
      ...(crawl ? { crawl: true as const } : {}),
    },
    candidates: stop.candidates.map(({ entityId }) => ({
      entityId,
      response: 'pending',
      reactions: ['opportunity-attack'],
    })),
    ineligible: stop.ineligible.map((entry) => ({ ...entry })),
    openedBy: context.commandId,
    closedBy: null,
  };
  events.push({ type: 'ReactionWindowOpened', payload: { window } });
  return events;
}

/**
 * After the window of a provoking move: the rest of the path goes on — as far as the mover can
 * still walk it (an attack may have slowed it) — unless it can no longer move: dead, at 0 HP,
 * Incapacitated or at Speed 0, when it stays (ADR 0046 §2). It may stop at the next reach.
 */
export function continueMove(
  context: DecisionContext,
  state: WorldState,
  trigger: Extract<ReactionWindowRecord['trigger'], { kind: 'move' }>,
  ids: readonly string[],
  dice: Dice,
): DraftEvent[] {
  const encounter = state.encounter;
  const mover = encounter ? combatantOf(encounter, trigger.moverId) : undefined;
  if (!encounter || !mover || !isAlive(state, mover.entityId)) return [];
  const vitals = vitalsOf(state, mover.entityId);
  if (!vitals || incapacitated(vitals) || speedOf(vitals) === 0) return [];
  const crawl = trigger.crawl === true;
  let rest = trigger.rest;
  while (rest.length > 0 && !movePlan(state, encounter, mover, rest, crawl).legal)
    rest = rest.slice(0, -1);
  // Its first step was this window's: those it provoked have answered.
  return rest.length === 0
    ? []
    : walk(context, state, encounter, mover, rest, ids, dice, crawl, true);
}
