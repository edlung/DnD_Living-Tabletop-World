import type { Side, Square } from '@ltw/contracts';
import {
  combatantOf,
  wieldedWeapons,
  type CombatantRecord,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import { WEAPONS, squareDistanceFt } from '@ltw/rules';

import { isAlive, turnStateOf } from '../battlefield.ts';
import { UNARMED_STRIKE, type Refusal } from '../legality.ts';
import { has, incapacitated, vitalsOf, type Vitals } from '../vitals.ts';

/**
 * Opportunity attacks (docs/adr/0046-reactions-beyond-counterspell.md §2): a creature that leaves
 * a hostile creature's reach by its own movement, without Disengage, provokes it. Who may react,
 * with what and from where; the move that stops for them is `movement.ts`'s `walk`.
 */

/** Party and hostile are hostile to each other; a neutral combatant neither provokes nor reacts. */
export const hostileSides = (a: Side, b: Side): boolean =>
  (a === 'party' && b === 'hostile') || (a === 'hostile' && b === 'party');

export interface MeleeAttack {
  readonly attackId: string;
  /** A stat block attack's name; null for a character's weapon or Unarmed Strike. */
  readonly name: string | null;
  readonly reachFt: number;
}

/** A creature's melee attacks: its stat block's; a character's melee weapons and Unarmed Strike. */
export function meleeAttacks(state: WorldState, vitals: Vitals): MeleeAttack[] {
  if (vitals.kind === 'creature') {
    return vitals.block.attacks
      .filter((attack) => attack.kind === 'melee')
      .map((attack) => ({
        attackId: attack.attackId,
        name: attack.name,
        reachFt: attack.reachFt ?? 5,
      }));
  }
  const weapons = [
    ...new Set([...vitals.sheet.weapons, ...wieldedWeapons(state, vitals.entityId)]),
  ];
  return [
    ...weapons
      .filter((weaponId) => !WEAPONS[weaponId].ranged)
      .map((attackId) => ({ attackId, name: null, reachFt: 5 })),
    { attackId: UNARMED_STRIKE, name: null, reachFt: 5 },
  ];
}

/** How far a creature's melee reaches (5 ft, or a stat block attack's own reach). */
const reachOf = (attacks: readonly MeleeAttack[]): number =>
  Math.max(5, ...attacks.map((attack) => attack.reachFt));

export interface OpportunityPlan {
  readonly legal: true;
  readonly record: CombatantRecord;
  readonly attacks: readonly MeleeAttack[];
}

/** Whether `reactorId` may take an opportunity attack at `moverId` now. */
export function opportunityPlan(
  state: WorldState,
  encounter: EncounterState,
  reactorId: string,
  moverId: string,
): OpportunityPlan | Refusal {
  const record = combatantOf(encounter, reactorId);
  const mover = combatantOf(encounter, moverId);
  if (!record || !mover || reactorId === moverId)
    return { legal: false, reason: 'NOT_A_COMBATANT' };
  if (!hostileSides(record.side, mover.side)) return { legal: false, reason: 'NOT_A_FOE' };
  if (!isAlive(state, reactorId)) return { legal: false, reason: 'ACTOR_DEAD' };
  const vitals = vitalsOf(state, reactorId);
  const seen = vitalsOf(state, moverId);
  if (!vitals || !seen) return { legal: false, reason: 'NOT_A_COMBATANT' };
  if (incapacitated(vitals)) return { legal: false, reason: 'INCAPACITATED' };
  if (!turnStateOf(encounter, record).reactionAvailable)
    return { legal: false, reason: 'NO_REACTION' };
  // It must see the mover (light and sight come with 640g).
  if (has(vitals, 'blinded') || has(seen, 'invisible')) {
    return { legal: false, reason: 'TARGET_NOT_VISIBLE' };
  }
  return { legal: true, record, attacks: meleeAttacks(state, vitals) };
}

export interface Provocation {
  /** How many squares of the path are walked before the step that leaves reach. */
  readonly walked: number;
  readonly candidates: readonly { readonly entityId: string }[];
  readonly ineligible: readonly { readonly entityId: string; readonly reason: string }[];
}

/**
 * The first step of `path` that leaves the reach of a hostile creature able to react, with who may
 * and who may not; null when the move provokes no one (Disengage, or no reach left).
 */
export function firstProvocation(
  state: WorldState,
  encounter: EncounterState,
  mover: CombatantRecord,
  path: readonly Square[],
  /** The first step was already offered (a move going on after its window): only later ones ask. */
  offered = false,
): Provocation | null {
  if (mover.turn.disengaged === true) return null;
  let from: Square = mover.position;
  for (const [index, to] of path.entries()) {
    if (offered && index === 0) {
      from = to;
      continue;
    }
    const candidates: { entityId: string }[] = [];
    const ineligible: { entityId: string; reason: string }[] = [];
    for (const other of encounter.combatants) {
      if (other.entityId === mover.entityId || !hostileSides(other.side, mover.side)) continue;
      const vitals = vitalsOf(state, other.entityId);
      if (!vitals || !isAlive(state, other.entityId)) continue;
      const reach = reachOf(meleeAttacks(state, vitals));
      const leaves =
        squareDistanceFt(other.position, from) <= reach &&
        squareDistanceFt(other.position, to) > reach;
      if (!leaves) continue;
      const plan = opportunityPlan(state, encounter, other.entityId, mover.entityId);
      if (plan.legal) candidates.push({ entityId: other.entityId });
      else ineligible.push({ entityId: other.entityId, reason: plan.reason });
    }
    if (candidates.length > 0) return { walked: index, candidates, ineligible };
    from = to;
  }
  return null;
}
