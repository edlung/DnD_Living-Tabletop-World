import type { ReactionId } from '@ltw/contracts';
import {
  REACTION_WINDOW_ID_INDEX,
  combatantOf,
  type CombatantRecord,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type EncounterState,
  type ReactionWindowRecord,
  type WorldState,
} from '@ltw/domain';
import { FEATHER_FALL, fallDice } from '@ltw/rules';

import { gapBetween, isAlive } from '../battlefield.ts';
import { fallEvents } from '../falling.ts';
import type { Refusal } from '../legality.ts';
import { canSee } from '../sight.ts';
import { incapacitated, vitalsOf, type Vitals } from '../vitals.ts';
import { castReaction, openWindow, type Payment } from './attack-windows.ts';

/**
 * A fall's moment (docs/adr/0049-space-and-movement.md §8): before the falling land, a character
 * who can see one of them within 60 ft may slow up to five with Feather Fall — its Reaction and a
 * level 1 slot or higher — and they land on their feet, unharmed. With someone to ask, the fall
 * waits in a window; with no one, or nothing to slow (a fall under 10 ft hurts no one), it lands
 * now. A move's fall and an attack's (a shove, Push, a flyer struck down) ask; a spell's, a DM's
 * ruling and a turn's start land at once.
 */
export interface Faller {
  /** Where it lands, as this decision leaves it. */
  readonly record: CombatantRecord;
  readonly vitals: Vitals;
  readonly feet: number;
}

type FallTrigger = Extract<ReactionWindowRecord['trigger'], { kind: 'fall' }>;

/** Feather Fall at the falling: the nearest it can see decides the range. */
export function featherFallPlan(
  state: WorldState,
  encounter: EncounterState,
  reactorId: string,
  fallers: readonly CombatantRecord[],
  vitals: Vitals | null = vitalsOf(state, reactorId),
): Payment | Refusal {
  const record = combatantOf(encounter, reactorId);
  if (!record || !vitals) return { legal: false, reason: 'NOT_A_COMBATANT' };
  if (!isAlive(state, reactorId) || incapacitated(vitals)) {
    return { legal: false, reason: 'INCAPACITATED' };
  }
  const seen = fallers.filter((faller) => canSee(state, encounter, record, faller));
  const nearest = Math.min(
    ...(seen.length > 0 ? seen : fallers).map((faller) => gapBetween(state, record, faller)),
  );
  return castReaction(encounter, vitals, record, 'feather-fall', {
    distanceFt: nearest,
    visible: seen.length > 0,
  });
}

/** The falls of this moment: a window when someone may slow them, else the ground now. */
export function fallMoment(
  context: DecisionContext,
  state: WorldState,
  dice: Dice,
  ids: readonly string[],
  fallers: readonly Faller[],
  nestUnder?: string,
): DraftEvent[] {
  const hurting = fallers.filter((faller) => fallDice(faller.feet) > 0);
  const encounter = state.encounter;
  const asked =
    encounter && hurting.length > 0 && ids[REACTION_WINDOW_ID_INDEX] !== undefined
      ? encounter.combatants
          .filter((one) => vitalsOf(state, one.entityId)?.kind === 'character')
          .filter(
            (one) =>
              featherFallPlan(
                state,
                encounter,
                one.entityId,
                hurting.map((faller) => faller.record),
              ).legal,
          )
      : [];
  if (asked.length === 0) {
    return hurting.flatMap((faller) => fallEvents(state, dice, faller.vitals, faller.feet).events);
  }
  const trigger: FallTrigger = {
    kind: 'fall',
    fallers: hurting.map((faller) => ({ entityId: faller.record.entityId, feet: faller.feet })),
  };
  const reactions: ReactionId[] = ['feather-fall'];
  return openWindow(
    context,
    state,
    trigger,
    asked.map((one) => ({ entityId: one.entityId, reactions })),
    ids,
    nestUnder,
  );
}

/**
 * The window closed: each caster who answered slowed up to five it could reach, in the order they
 * fell; the rest land hard, 1d6 a 10 ft and Prone.
 */
export function landFalls(
  state: WorldState,
  dice: Dice,
  window: ReactionWindowRecord,
): DraftEvent[] {
  const { trigger } = window;
  const encounter = state.encounter;
  if (trigger.kind !== 'fall' || !encounter) return [];
  const slowed = new Set<string>();
  for (const candidate of window.candidates) {
    const caster = combatantOf(encounter, candidate.entityId);
    if (candidate.response !== 'used' || !caster) continue;
    let left: number = FEATHER_FALL.creatures;
    for (const { entityId } of trigger.fallers) {
      const faller = combatantOf(encounter, entityId);
      if (left === 0 || slowed.has(entityId) || !faller) continue;
      if (gapBetween(state, caster, faller) > FEATHER_FALL.rangeFt) continue;
      slowed.add(entityId);
      left -= 1;
    }
  }
  return trigger.fallers.flatMap(({ entityId, feet }) => {
    const vitals = vitalsOf(state, entityId);
    if (slowed.has(entityId) || !vitals || !isAlive(state, entityId)) return [];
    return fallEvents(state, dice, vitals, feet).events;
  });
}
