import {
  ACTION_SKILLS,
  type CombatAction,
  type ContextEntityRef,
  type ContextHint,
  type ContextIllegalReason,
  type SpellId,
  type AttackExtra,
  type WeaponId,
} from '@ltw/contracts';
import {
  actionPlan,
  attackPlan,
  characterSpellPlan,
  chooseUsing,
  counterspellPlan,
  fireballArea,
  type Refusal,
} from '@ltw/combat';
import {
  combatantOf,
  openReactionWindow,
  type CombatantRecord,
  type EncounterState,
} from '@ltw/domain';
import { squareDistanceFt } from '@ltw/rules';

import type { ContextInputs } from './inputs.ts';
import type { Verdict } from './legality.ts';

/**
 * Context in combat (docs/adr/0015-combat-engine.md §6, amending ADR 0012).
 * When the acting character is a combatant, legality comes from the same
 * combat legality the World Engine applies: real distances, cover, and the
 * turn's action economy. Distances are shown only between combatants. While
 * a reaction window is open the encounter waits (ADR 0016 §4): combat
 * actions are `REACTION_PENDING`, and a pending candidate may counter.
 */
const PAUSED: Verdict = { legal: false, reason: 'REACTION_PENDING' };
const paused = (inputs: ContextInputs) => openReactionWindow(inputs.state) !== null;
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
  weaponId: WeaponId = 'longbow',
  /** An extra attack (docs/adr/0047-weapons.md): the other hand's, or Cleave's. */
  extra?: AttackExtra,
): Verdict {
  if (paused(inputs)) return PAUSED;
  const plan = attackPlan(
    inputs.state,
    frame.encounter,
    frame.actor.entityId,
    weaponId,
    targetId,
    'action',
    extra === undefined ? {} : { extra },
  );
  if (!plan.legal) return fromRefusal(plan);
  // What tilts the roll on the whole, beside long range's own word (docs/adr/0047-weapons.md).
  const tilt: ContextHint | null =
    plan.advantage === plan.disadvantage ? null : plan.advantage ? 'ADVANTAGE' : 'DISADVANTAGE';
  const hints: ContextHint[] = [];
  if (plan.longRange) hints.push('LONG_RANGE');
  if (tilt !== null && !(tilt === 'DISADVANTAGE' && plan.longRange)) hints.push(tilt);
  return {
    legal: true,
    ...(hints.length > 0 ? { hints } : {}),
    ...(plan.weapon.mastery !== null ? { mastery: plan.weapon.mastery } : {}),
  };
}

/**
 * An action beside Attack and Magic (docs/adr/0045-conditions-and-actions.md §5), as the World
 * Engine judges it now. Search, Study and Influence are judged with their first skill and Ready
 * with a stand-in attack: the player picks the skill, or the attack and its trigger, next.
 */
export function combatActionVerdict(
  frame: CombatFrame,
  inputs: ContextInputs,
  action: CombatAction,
  targetId?: string,
): Verdict {
  if (paused(inputs)) return PAUSED;
  const plan = actionPlan(inputs.state, frame.encounter, frame.actor, {
    action,
    targetId,
    skill: ACTION_SKILLS[action]?.[0],
    readied: action === 'ready' ? { attackId: 'longbow', trigger: 'ready' } : undefined,
  });
  return plan.legal ? { legal: true } : fromRefusal(plan);
}

export function combatSpellVerdict(
  inputs: ContextInputs,
  spellId: SpellId,
  targetId?: string,
): Verdict {
  if (!inputs.sheet) return { legal: false, reason: 'NO_CHARACTER_SHEET' };
  if (paused(inputs)) return PAUSED;
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
  if (paused(inputs)) return { ...PAUSED, area };
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

/**
 * Counterspell against the caster of the open window, for a pending candidate
 * only (ADR 0016 §4); null when the action does not apply. Legality and cost
 * come from the same eligibility check the World Engine applies to the answer.
 */
export function counterspellVerdict(
  frame: CombatFrame,
  inputs: ContextInputs,
  targetId: string,
): Verdict | null {
  const window = openReactionWindow(inputs.state);
  if (window?.trigger.kind !== 'spell' || window.trigger.casterId !== targetId) return null;
  const mine = window.candidates.find((c) => c.entityId === inputs.actor.entityId);
  if (mine?.response !== 'pending') return null;
  const plan = counterspellPlan(
    inputs.state,
    frame.encounter,
    inputs.actor.entityId,
    targetId,
    window.trigger.components,
  );
  if (!plan.legal) return fromRefusal(plan);
  return { legal: true, cost: { kind: 'slot', slotLevel: plan.slotLevel } };
}
