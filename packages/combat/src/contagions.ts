import type { ContagionState, KernelCommandOf } from '@ltw/contracts';
import {
  accept,
  reject,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
} from '@ltw/domain';
import { contagionRules } from '@ltw/rules';

import { living } from './hand.ts';
import { exhausted } from './hazards.ts';
import { combatPremises } from './refusal.ts';
import { spellSave } from './saves.ts';
import {
  conditionImmune,
  exhaustionOf,
  has,
  vitalsEvent,
  withConditions,
  withSheet,
  type Vitals,
} from './vitals.ts';

/**
 * A magical contagion's course (docs/adr/0055-rules-reference-and-toolbox.md §4), on the sheet of
 * the character it infects. The DM infects — the World Engine rolls the Constitution save the
 * contagion names — and follows it: it takes hold (a level of Exhaustion), the character fights it
 * (the save at a Long Rest's end or at dawn), or magic ends it. The DM says when; the dice decide.
 */
const contagionsOf = (v: Vitals): readonly ContagionState[] =>
  v.kind === 'character' ? (v.sheet.contagions ?? []) : [];

function withContagions(v: Vitals, list: readonly ContagionState[]): Vitals {
  return withSheet(v, (sheet) => {
    const next = { ...sheet };
    if (list.length > 0) next.contagions = [...list];
    else delete next.contagions;
    return next;
  });
}

const condition = (targetId: string, applied: boolean): DraftEvent => ({
  type: 'ConditionApplied',
  payload: { targetId, condition: 'blinded', applied, cause: 'contagion' },
});

export function decideInfectWithContagion(
  context: DecisionContext,
  command: KernelCommandOf<'InfectWithContagion'>,
  dice: Dice,
): Decision {
  const { state } = context;
  const target = living(state, command.targetId);
  if (!target.ok) return target.decision;
  if (target.vitals.kind !== 'character')
    return reject('INVALID_COMMAND', 'Only a character keeps a contagion’s course');
  if (contagionsOf(target.vitals).some((one) => one.contagionId === command.contagionId))
    return reject('NO_EFFECT', 'It carries that contagion already');
  const rules = contagionRules(command.contagionId);
  const events: DraftEvent[] = [combatPremises(state, command.targetId)];
  if (rules.infection) {
    const save = spellSave(dice, target.vitals, 'con', rules.infection.dc, 'none', 'hazard');
    events.push(save.event);
    if (save.success) return accept(...events);
  }
  let vitals = withContagions(target.vitals, [
    ...contagionsOf(target.vitals),
    { contagionId: command.contagionId, takenHold: rules.atOnce !== null, successes: 0 },
  ]);
  if (rules.atOnce && !has(vitals, rules.atOnce) && !conditionImmune(vitals, rules.atOnce)) {
    vitals = withConditions(vitals, [rules.atOnce], []);
    events.push(condition(command.targetId, true));
  }
  return accept(...events, vitalsEvent(vitals));
}

export function decideContagionCourse(
  context: DecisionContext,
  command: KernelCommandOf<'ContagionCourse'>,
  dice: Dice,
): Decision {
  const { state } = context;
  const target = living(state, command.targetId);
  if (!target.ok) return target.decision;
  const carried = contagionsOf(target.vitals).find(
    (one) => one.contagionId === command.contagionId,
  );
  if (!carried) return reject('NO_EFFECT', 'It does not carry that contagion');
  const rules = contagionRules(command.contagionId);
  const others = contagionsOf(target.vitals).filter((one) => one !== carried);
  const events: DraftEvent[] = [combatPremises(state, command.targetId)];
  // Exhaustion a level up or down, death at the sixth.
  const exhaustion = (vitals: Vitals, change: number) => {
    const worse = exhausted(state, vitals, exhaustionOf(vitals) + change);
    events.push(...worse.events);
    return worse;
  };
  const ended = (vitals: Vitals) => withContagions(vitals, others);
  const kept = (vitals: Vitals, next: ContagionState) =>
    withContagions(
      vitals,
      [...others, next].sort((a, b) => a.contagionId.localeCompare(b.contagionId)),
    );
  switch (command.step) {
    case 'takes-hold': {
      if (carried.takenHold) return reject('NO_EFFECT', 'It has taken hold already');
      const worse = exhaustion(target.vitals, 1);
      return accept(...events, vitalsEvent(kept(worse.vitals, { ...carried, takenHold: true })));
    }
    case 'fight': {
      if (!rules.fight)
        return reject('INVALID_COMMAND', 'Magic or an ointment ends it, not a save');
      if (!carried.takenHold) return reject('NO_EFFECT', 'It has not taken hold yet');
      const save = spellSave(dice, target.vitals, 'con', rules.fight.dc, 'none', 'hazard');
      events.push(save.event);
      if (rules.fight.course === 'three-successes') {
        if (!save.success) return accept(...events);
        const successes = carried.successes + 1;
        if (successes < 3)
          return accept(...events, vitalsEvent(kept(target.vitals, { ...carried, successes })));
        // Three saves won: it ends, and so does the level of Exhaustion it gave.
        const better = exhaustion(target.vitals, -1);
        return accept(...events, vitalsEvent(ended(better.vitals)));
      }
      const changed = exhaustion(target.vitals, save.success ? -1 : 1);
      if (changed.dead) return accept(...events, vitalsEvent(changed.vitals));
      const over = exhaustionOf(changed.vitals) === 0;
      return accept(...events, vitalsEvent(over ? ended(changed.vitals) : changed.vitals));
    }
    case 'cure': {
      let vitals = ended(target.vitals);
      if (rules.atOnce && has(vitals, rules.atOnce)) {
        vitals = withConditions(vitals, [], [rules.atOnce]);
        events.push(condition(command.targetId, false));
      }
      if (rules.fight?.course === 'three-successes' && carried.takenHold)
        vitals = exhaustion(vitals, -1).vitals;
      return accept(...events, vitalsEvent(vitals));
    }
  }
}
