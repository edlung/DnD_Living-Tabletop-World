import {
  isCombatant,
  premisesEvent,
  reject,
  type Decision,
  type DraftEvent,
  type Premise,
  type WorldState,
} from '@ltw/domain';

import type { Refusal } from './legality.ts';

/**
 * Rejections of combat commands. Rules reasons become `ILLEGAL_ACTION` with
 * the reason as the message, a fixed vocabulary that carries no data
 * (docs/adr/0015-combat-engine.md).
 */
export function refused(refusal: Refusal): Decision & { ok: false } {
  switch (refusal.reason) {
    case 'NOT_IN_COMBAT':
    case 'NOT_A_COMBATANT':
    case 'NOT_YOUR_TURN':
    case 'ACTOR_DEAD':
    case 'TARGET_DEAD':
      return reject(refusal.reason, refusal.reason);
    default:
      return reject(
        'ILLEGAL_ACTION',
        refusal.reason,
        refusal.resolution
          ? { reason: refusal.reason, resolution: refusal.resolution }
          : { reason: refusal.reason },
      );
  }
}

/**
 * What a decision relied on beyond the encounter (which every combat event
 * reads): a character's own sheet and, when the actor takes part in the
 * encounter, every combatant's status, sheet, and stat block. Any of them can
 * decide a result (an Armor Class turning a hit into a miss, who is alive for
 * turn order or occupancy), and a result that changed nothing must still
 * block undo of what it read (Gate 03, G03-H02). Participation, not the mere
 * existence of an encounter, decides this, exactly as it decides legality:
 * a fight the actor is not in is no premise of its own (Gate 03, G03-H04).
 * The controlling-player premise is added centrally by the World Engine
 * (Gate 02, G02-H03).
 */
export function combatPremiseList(state: WorldState, combatantId: string): Premise[] {
  const character = state.entities.get(combatantId)?.kind === 'character';
  const combatants = isCombatant(state, combatantId) ? (state.encounter?.combatants ?? []) : [];
  return [
    ...(character ? [{ kind: 'sheet' } as const] : []),
    ...combatants.map(({ entityId }): Premise => ({ kind: 'vitals', entityId })),
  ];
}

export const combatPremises = (state: WorldState, combatantId: string): DraftEvent =>
  premisesEvent(combatantId, combatPremiseList(state, combatantId));
