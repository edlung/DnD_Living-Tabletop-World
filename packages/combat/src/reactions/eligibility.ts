import type { CharacterSheet, SpellComponent } from '@ltw/contracts';
import {
  combatantOf,
  type CombatantRecord,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import { applyCast, checkCounterspell, slotsRemaining, type TurnState } from '@ltw/rules';

import { coverOf, gapBetween, isAlive, turnStateOf } from '../battlefield.ts';
import type { CombatReason, Refusal } from '../legality.ts';
import { vitalsOf } from '../vitals.ts';

/**
 * The reaction matcher and Counterspell eligibility
 * (docs/adr/0016-reaction-engine.md §1). The Rules decide (`checkCounterspell`,
 * ADR 0011); this module only gathers their inputs from the encounter. The
 * same check opens a window, accepts an answer, and feeds the Context Engine.
 */
const refuse = (reason: CombatReason): Refusal => ({ legal: false, reason });

/** Counterspell needs a slot of level 3 or higher: the lowest one left, else level 3 (NO_SLOT). */
export function counterspellSlot(sheet: CharacterSheet): number {
  for (let level = 3; level <= 9; level += 1) {
    if (slotsRemaining(sheet, level) > 0) return level;
  }
  return 3;
}

export interface CounterspellPlan {
  readonly legal: true;
  readonly record: CombatantRecord;
  readonly slotLevel: number;
  /** The reactor's spell save DC: the target's Constitution save is against it. */
  readonly saveDc: number;
  /** The reactor's sheet and turn after paying for Counterspell. */
  readonly sheet: CharacterSheet;
  readonly turn: TurnState;
}

export function counterspellPlan(
  state: WorldState,
  encounter: EncounterState,
  reactorId: string,
  casterId: string,
  components: readonly SpellComponent[],
  using?: { readonly slotLevel: number },
): CounterspellPlan | Refusal {
  const record = combatantOf(encounter, reactorId);
  const caster = combatantOf(encounter, casterId);
  if (!record || !caster) return refuse('NOT_A_COMBATANT');
  if (reactorId === casterId) return refuse('NO_VALID_TRIGGER');
  if (!isAlive(state, reactorId)) return refuse('ACTOR_DEAD');
  const vitals = vitalsOf(state, reactorId);
  // Stat blocks have no reactions in Stage 90 (ADR 0016 §6).
  if (vitals?.kind !== 'character') return refuse('NOT_KNOWN');
  const turn = turnStateOf(encounter, record);
  const slotLevel = using?.slotLevel ?? counterspellSlot(vitals.sheet);
  const plan = checkCounterspell(
    vitals.sheet,
    turn,
    {
      casterDistanceFt: gapBetween(state, record, caster),
      casterVisible: coverOf(state, encounter, caster) !== 'total',
      components,
    },
    slotLevel,
  );
  if (!plan.legal) return refuse(plan.reason);
  const after = applyCast(vitals.sheet, turn, plan);
  return {
    legal: true,
    record,
    slotLevel,
    saveDc: plan.saveDc,
    sheet: after.sheet,
    turn: after.turn,
  };
}

export interface Matched {
  /** Eligible combatants, in initiative order. */
  readonly candidates: readonly string[];
  /** Everyone else considered, with the Rules' reason. */
  readonly ineligible: readonly { readonly entityId: string; readonly reason: string }[];
}

/** Who could counter a spell `casterId` is casting right now. */
export function counterspellCandidates(
  state: WorldState,
  encounter: EncounterState,
  casterId: string,
  components: readonly SpellComponent[],
): Matched {
  const candidates: string[] = [];
  const ineligible: { entityId: string; reason: string }[] = [];
  for (const { entityId } of encounter.combatants) {
    if (entityId === casterId) continue;
    const plan = counterspellPlan(state, encounter, entityId, casterId, components);
    if (plan.legal) candidates.push(entityId);
    else ineligible.push({ entityId, reason: plan.reason });
  }
  return { candidates, ineligible };
}
