import type { CombatAction, KernelCommandOf } from '@ltw/contracts';
import {
  accept,
  combatantOf,
  type CombatantRecord,
  type CombatCommand,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import { abilityModifier, proficiencyBonus, sizeRank, totalLevel } from '@ltw/rules';

import {
  combatantEvent,
  encounterOf,
  gapBetween,
  isAlive,
  onTurn,
  withTurn,
} from './battlefield.ts';
import { FightWork, endCondition, revealed, sourceOf, withDetail } from './condition-details.ts';
import { attackPlan, type Refusal } from './legality.ts';
import { fallMoment } from './reactions/fall-window.ts';
import { pushedTo } from './masteries.ts';
import { isObject } from './objects.ts';
import { combatPremises, refused } from './refusal.ts';
import { spellSave } from './saves.ts';
import { fitAt } from './space.ts';
import {
  conditionImmune,
  has,
  incapacitated,
  saveModifier,
  sizeOf,
  vitalsOf,
  withConditions,
  type Vitals,
} from './vitals.ts';
import { UNARMED_STRIKE } from './weapon-view.ts';

/**
 * Unarmed Strike's grapple and shove (docs/adr/0047-weapons.md §3), and what a grapple is after:
 * the escape with an action, letting go at will, and a grapple ending when its grappler can no
 * longer hold — Incapacitated, gone, dead, or more than 5 ft away — checked as each turn starts.
 */
type AttackCommand = Extract<CombatCommand, { type: 'Attack' }>;

/** A grapple's DC: 8 + Strength modifier + Proficiency Bonus (a monster's +2 until Stage 650). */
export function grappleDc(v: Vitals): number {
  return v.kind === 'character'
    ? 8 + abilityModifier(v.sheet.abilities.str) + proficiencyBonus(totalLevel(v.sheet))
    : 8 + abilityModifier(v.block.abilities.str) + 2;
}

/** The creatures a grappler holds in the fight. */
export const heldBy = (
  state: WorldState,
  encounter: EncounterState,
  grapplerId: string,
): CombatantRecord[] =>
  encounter.combatants.filter((c) => {
    if (sourceOf(c, 'grappled') !== grapplerId) return false;
    const vitals = vitalsOf(state, c.entityId);
    return vitals !== null && has(vitals, 'grappled');
  });

/** The DC to escape a creature's grapple, when its grappler is known. */
export function escapeDcOf(state: WorldState, record: CombatantRecord): number | null {
  const grapplerId = sourceOf(record, 'grappled');
  const grappler = grapplerId === null ? null : vitalsOf(state, grapplerId);
  return grappler ? grappleDc(grappler) : null;
}

/** A grapple or a shove: the target's Strength or Dexterity save, whichever is better. */
export function decideUnarmed(
  context: DecisionContext,
  command: AttackCommand,
  dice: Dice,
): Decision {
  const { state } = context;
  const encounter = encounterOf(state);
  if (!encounter.ok) return encounter;
  const current = onTurn(encounter.value, command.combatantId);
  if (!current.ok) return current;
  const effect = command.unarmed;
  if (command.attackId !== UNARMED_STRIKE) return refused(noWeapon);
  const plan = attackPlan(
    state,
    encounter.value,
    command.combatantId,
    UNARMED_STRIKE,
    command.targetId,
  );
  if (!plan.legal || effect === undefined) return refused(plan.legal ? noWeapon : plan);
  const { target, targetVitals, attackerVitals } = plan;
  // A grapple or a shove takes hold of a creature (docs/adr/0048-hit-points.md §5).
  if (isObject(targetVitals)) return refused({ legal: false, reason: 'NOT_A_CREATURE' });
  // No more than one size larger than the attacker (docs/adr/0049-space-and-movement.md §3).
  if (sizeRank(sizeOf(targetVitals)) > sizeRank(sizeOf(attackerVitals)) + 1) {
    return refused({ legal: false, reason: 'TOO_LARGE' });
  }
  if (
    effect === 'grapple' &&
    sourceOf(target, 'grappled') === command.combatantId &&
    has(targetVitals, 'grappled')
  ) {
    return refused({ legal: false, reason: 'ALREADY_GRAPPLED' });
  }
  const work = new FightWork(state, encounter.value.combatants);
  // One attack of the Attack action; any attack ends Cleave's offer (ADR 0047 §2).
  const attacker = withTurn(plan.attacker, {
    ...plan.turn,
    attacksRemaining: plan.turn.attacksRemaining - 1,
  });
  const turn = { ...attacker.turn };
  delete turn.cleave;
  const events: DraftEvent[] = [combatPremises(state, command.combatantId)];
  let actor: CombatantRecord = { ...attacker, turn };
  if (plan.hidden) {
    events.push(...revealed(command.combatantId, attackerVitals));
    actor = withDetail(actor, 'invisible', null);
  }
  events.push(work.record(actor));
  const ability =
    saveModifier(targetVitals, 'dex') > saveModifier(targetVitals, 'str') ? 'dex' : 'str';
  const save = spellSave(
    dice,
    targetVitals,
    ability,
    grappleDc(attackerVitals),
    'none',
    effect,
    false,
    target.squeezed === true,
  );
  events.push(save.event);
  if (save.success) return accept(...events);
  // A creature immune to the condition is held or toppled by nothing (docs/adr/0053 §1).
  if (conditionImmune(targetVitals, effect === 'grapple' ? 'grappled' : 'prone'))
    return accept(...events);
  if (effect === 'grapple') {
    events.push(
      {
        type: 'ConditionApplied',
        payload: {
          targetId: target.entityId,
          condition: 'grappled',
          applied: true,
          cause: 'grapple',
        },
      },
      work.vitals(withConditions(targetVitals, ['grappled'], [])),
      work.record(withDetail(target, 'grappled', { sourceId: command.combatantId })),
    );
    return accept(...events);
  }
  if (command.shove === 'prone') {
    if (!has(targetVitals, 'prone')) {
      events.push(
        {
          type: 'ConditionApplied',
          payload: { targetId: target.entityId, condition: 'prone', applied: true, cause: 'shove' },
        },
        work.vitals(withConditions(targetVitals, ['prone'], [])),
      );
    }
    return accept(...events);
  }
  const to = pushedTo(state, encounter.value, actor, target, 5);
  if (to.square.x !== target.position.x || to.square.y !== target.position.y) {
    const landed = { ...target, position: { ...to.square } };
    events.push(work.record(landed));
    // Pushed out of a grapple's reach, it is held no longer.
    events.push(...grapplesSweep(work, state));
    // Shoved off a drop, it falls: Feather Fall's moment (docs/adr/0049-space-and-movement.md §8).
    if (to.fallFt > 0) {
      const ids = command.resolution?.ids ?? [];
      events.push(
        ...fallMoment(context, state, dice, ids, [
          { record: landed, vitals: targetVitals, feet: to.fallFt },
        ]),
      );
    }
  }
  return accept(...events);
}

const noWeapon: Refusal = { legal: false, reason: 'NO_WEAPON' };

/** Letting go (no action): every creature the actor holds is free, or only the one named. */
export function decideRelease(
  context: DecisionContext,
  command: KernelCommandOf<'TakeAction'>,
): Decision {
  const { state } = context;
  const encounter = encounterOf(state);
  if (!encounter.ok) return encounter;
  const current = onTurn(encounter.value, command.combatantId);
  if (!current.ok) return current;
  const held = heldBy(state, encounter.value, command.combatantId).filter(
    (c) => command.targetId === undefined || c.entityId === command.targetId,
  );
  if (held.length === 0) return refused({ legal: false, reason: 'NOT_GRAPPLING' });
  const work = new FightWork(state, encounter.value.combatants);
  return accept(
    combatPremises(state, command.combatantId),
    {
      type: 'ActionTaken',
      payload: {
        combatantId: command.combatantId,
        action: 'release' satisfies CombatAction,
        ...(command.targetId === undefined ? {} : { targetId: command.targetId }),
      },
    },
    ...held.flatMap((c) => endCondition(work, c.entityId, 'grappled', 'released')),
  );
}

/**
 * Grapples their grappler can no longer hold end: the grappler gone from the fight, dead,
 * Incapacitated, or more than 5 ft away. Read as each turn starts and after a creature is moved.
 */
export function grapplesSweep(work: FightWork, state: WorldState): DraftEvent[] {
  const events: DraftEvent[] = [];
  for (const held of [...work.combatants]) {
    const grapplerId = sourceOf(held, 'grappled');
    if (grapplerId === null) continue;
    const grappler = work.combatant(grapplerId);
    const vitals = work.vitalsOf(grapplerId);
    const holds =
      grappler !== undefined &&
      vitals !== null &&
      isAlive(state, grapplerId) &&
      !incapacitated(vitals) &&
      gapBetween(state, grappler, held) <= 5;
    if (!holds) events.push(...endCondition(work, held.entityId, 'grappled', 'grapple-ended'));
  }
  return events;
}

/**
 * Where the creatures a grappler drags end up after its move (docs/adr/0047-weapons.md §3): the
 * first follows into the square the grappler left last; any other stays, and its grapple is
 * read again as the next turn starts.
 */
export function dragged(
  state: WorldState,
  encounter: EncounterState,
  grapplerId: string,
  trail: readonly { readonly x: number; readonly y: number }[],
): DraftEvent[] {
  const behind = trail.at(-2);
  const last = trail.at(-1);
  const first = heldBy(state, encounter, grapplerId)[0];
  if (!behind || !last || !first) return [];
  const record = combatantOf(encounter, first.entityId);
  if (!record) return [];
  // Its whole space must fit there, beside the grappler where it now stands
  // (docs/adr/0049-space-and-movement.md §1); else it stays, and the next turn's sweep reads it.
  const after: EncounterState = {
    ...encounter,
    combatants: encounter.combatants.map((c) =>
      c.entityId === grapplerId ? { ...c, position: { x: last.x, y: last.y } } : c,
    ),
  };
  const fit = fitAt(state, after, record, behind, true);
  return fit && !fit.squeezed
    ? [combatantEvent({ ...record, position: { x: behind.x, y: behind.y } })]
    : [];
}
