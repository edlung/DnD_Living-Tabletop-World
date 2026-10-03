import type { ContextEntityRef, ContextIllegalReason, SpellId } from '@ltw/contracts';
import {
  attackPlan,
  characterSpellPlan,
  chooseUsing,
  fireballArea,
  type Refusal,
} from '@ltw/combat';
import { combatantOf, type CombatantRecord, type EncounterState } from '@ltw/domain';
import { squareDistanceFt } from '@ltw/rules';

import type { ContextInputs } from './inputs.ts';
import type { Verdict } from './legality.ts';

/**
 * Context in combat (docs/adr/0015-combat-engine.md §6, amending ADR 0012).
 * When the acting character is a combatant, legality comes from the same
 * combat legality the World Engine applies: real distances, cover, and the
 * turn's action economy. Distances are shown only between combatants.
 */
export interface CombatFrame {
  readonly encounter: EncounterState;
  readonly actor: CombatantRecord;
}

export function combatFrame(inputs: ContextInputs): CombatFrame | null {
  const encounter = inputs.state.encounter;
  const actor = encounter ? combatantOf(encounter, inputs.actor.entityId) : undefined;
  return encounter && actor ? { encounter, actor } : null;
}

/** Feet to a combatant the actor perceives; undefined outside combat. */
export function distanceTo(inputs: ContextInputs, entityId: string): number | undefined {
  const frame = combatFrame(inputs);
  const target = frame ? combatantOf(frame.encounter, entityId) : undefined;
  if (!frame || !target || !inputs.perceived.has(entityId)) return undefined;
  return squareDistanceFt(frame.actor.position, target.position);
}

/** A combatant that is not part of the encounter cannot be fought there. */
function fromRefusal(refusal: Refusal): Verdict {
  const reason: ContextIllegalReason =
    refusal.reason === 'NOT_A_COMBATANT' ? 'NOT_IN_COMBAT' : refusal.reason;
  return {
    legal: false,
    reason,
    ...(refusal.resolution ? { resolution: { ...refusal.resolution } } : {}),
  };
}

export function combatAttackVerdict(
  frame: CombatFrame,
  inputs: ContextInputs,
  targetId: string,
): Verdict {
  const plan = attackPlan(inputs.state, frame.encounter, frame.actor.entityId, 'longbow', targetId);
  if (!plan.legal) return fromRefusal(plan);
  return plan.longRange ? { legal: true, hints: ['LONG_RANGE'] } : { legal: true };
}

export function combatSpellVerdict(
  inputs: ContextInputs,
  spellId: SpellId,
  targetId?: string,
): Verdict {
  if (!inputs.sheet) return { legal: false, reason: 'NO_CHARACTER_SHEET' };
  const cost = chooseUsing(inputs.sheet, spellId);
  const plan = characterSpellPlan(inputs.state, inputs.actor.entityId, {
    spellId,
    using: cost,
    ...(targetId === undefined ? {} : { targetId }),
  });
  if (!plan.legal) return fromRefusal(plan);
  return { legal: true, cost: cost === 'free' ? { kind: 'free' } : { kind: 'slot', ...cost } };
}

/**
 * Fireball centered on the selected combatant: the combatants it would affect,
 * with `ALLY_IN_AREA` when a party member (the caster included) is inside.
 * The warning never blocks the choice.
 */
export function fireballVerdict(
  frame: CombatFrame,
  inputs: ContextInputs,
  targetId: string,
  refOf: (entityId: string) => ContextEntityRef,
): Verdict {
  const target = combatantOf(frame.encounter, targetId);
  if (!target) return { legal: false, reason: 'NOT_IN_COMBAT' };
  if (!inputs.sheet) return { legal: false, reason: 'NO_CHARACTER_SHEET' };
  const affected = fireballArea(inputs.state, frame.encounter, target.position).filter((c) =>
    inputs.perceived.has(c.entityId),
  );
  const area = affected.map((c) => refOf(c.entityId));
  const ally = affected.some((c) => inputs.party.has(c.entityId));
  const cost = chooseUsing(inputs.sheet, 'fireball');
  const plan = characterSpellPlan(inputs.state, inputs.actor.entityId, {
    spellId: 'fireball',
    using: cost,
    point: target.position,
  });
  if (!plan.legal) return { ...fromRefusal(plan), area };
  return {
    legal: true,
    cost: cost === 'free' ? { kind: 'free' } : { kind: 'slot', ...cost },
    ...(ally ? { hints: ['ALLY_IN_AREA'] } : {}),
    area,
  };
}
