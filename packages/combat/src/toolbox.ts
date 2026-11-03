import type { KernelCommandOf } from '@ltw/contracts';
import {
  accept,
  reject,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type WorldState,
} from '@ltw/domain';
import { rollDamage, rollDice, sizeRank, trapRules, type TrapRules } from '@ltw/rules';

import { applyDamage } from './damage.ts';
import { fallEvents, killedIn } from './falling.ts';
import { living } from './hand.ts';
import { isObject } from './objects.ts';
import { combatPremises } from './refusal.ts';
import { spellSave } from './saves.ts';
import {
  conditionImmune,
  has,
  sizeOf,
  vitalsEvent,
  withConditions,
  type Vitals,
} from './vitals.ts';

/**
 * The Gameplay Toolbox at the table (docs/adr/0055-rules-reference-and-toolbox.md §4): a trap the
 * DM springs on the creatures it catches, and mental stress. Each creature makes its own save and
 * takes its own damage through the damage rules (resistances, temporary hit points, 0 hit points,
 * Concentration); a pit is a fall. The World Engine's dice decide; in a fight or out of one.
 */
interface Caught {
  readonly vitals: Vitals;
  readonly events: DraftEvent[];
  readonly dead: boolean;
}

function harm(
  state: WorldState,
  dice: Dice,
  caught: Caught,
  amount: number,
  damageType: string,
  rolls: readonly number[],
): Caught {
  if (caught.dead || amount <= 0) return caught;
  const applied = applyDamage(state, dice, caught.vitals, {
    sourceId: caught.vitals.entityId,
    amount,
    damageType,
    rolls,
    critical: false,
  });
  return {
    vitals: applied.vitals,
    events: [...caught.events, ...applied.events],
    dead: killedIn(applied.events, caught.vitals.entityId),
  };
}

function sprung(
  state: WorldState,
  dice: Dice,
  trap: TrapRules,
  tier: number,
  target: Vitals,
): Caught {
  const rules = trap.tiers[tier - 1];
  if (!rules) return { vitals: target, events: [], dead: false };
  let caught: Caught = {
    vitals: target,
    events: [combatPremises(state, target.entityId)],
    dead: false,
  };
  // The save, unless a Net cannot hold it (Huge or larger).
  let saved = false;
  if (rules.save) {
    if (trap.hugeEscapes && sizeRank(sizeOf(target)) >= sizeRank('huge')) saved = true;
    else {
      const save = spellSave(dice, target, rules.save.ability, rules.save.dc, 'none', 'hazard');
      caught = { ...caught, events: [...caught.events, save.event] };
      saved = save.success;
    }
  }
  // A pit: the fall first, then what waits at its bottom.
  if (rules.fallFt !== undefined) {
    const fall = fallEvents(state, dice, caught.vitals, rules.fallFt);
    caught = {
      vitals: fall.vitals,
      events: [...caught.events, ...fall.events],
      dead: killedIn(fall.events, target.entityId),
    };
  }
  if (!saved || trap.half) {
    for (const damage of rules.damage) {
      const darts = rules.darts
        ? (rollDice(dice, rules.darts.count, rules.darts.sides)[0] ?? 1)
        : 1;
      const rolls: number[] = [];
      let total = 0;
      for (let dart = 0; dart < darts; dart += 1) {
        const roll = rollDamage(dice, damage.count, damage.sides, 0);
        rolls.push(...roll.rolls);
        total += roll.total;
      }
      caught = harm(
        state,
        dice,
        caught,
        saved ? Math.floor(total / 2) : total,
        damage.damageType,
        rolls,
      );
    }
  }
  // What a failed save leaves it with: a Net's hold, a needle's poison, a stone's blow.
  const condition = trap.condition;
  if (saved || condition === null || caught.dead) return caught;
  if (has(caught.vitals, condition) || conditionImmune(caught.vitals, condition)) return caught;
  const held = withConditions(caught.vitals, [condition], []);
  return {
    vitals: held,
    events: [
      ...caught.events,
      {
        type: 'ConditionApplied',
        payload: { targetId: target.entityId, condition, applied: true, cause: 'trap' },
      },
      vitalsEvent(held),
    ],
    dead: false,
  };
}

/** The creatures caught, each living, with a sheet or a stat block; an object springs nothing. */
function caughtCreatures(
  state: WorldState,
  targetIds: readonly string[],
):
  | { readonly ok: true; readonly targets: Vitals[] }
  | { readonly ok: false; readonly decision: Decision } {
  const targets: Vitals[] = [];
  for (const targetId of targetIds) {
    const target = living(state, targetId);
    if (!target.ok) return target;
    if (isObject(target.vitals))
      return { ok: false, decision: reject('NO_EFFECT', 'An object takes no trap') };
    targets.push(target.vitals);
  }
  return { ok: true, targets };
}

export function decideSpringTrap(
  context: DecisionContext,
  command: KernelCommandOf<'SpringTrap'>,
  dice: Dice,
): Decision {
  const { state } = context;
  const trap = trapRules(command.trapId);
  if (command.tier > trap.tiers.length)
    return reject('INVALID_COMMAND', 'That trap has no such tier');
  const caught = caughtCreatures(state, command.targetIds);
  if (!caught.ok) return caught.decision;
  return accept(
    ...caught.targets.flatMap((target) => sprung(state, dice, trap, command.tier, target).events),
  );
}

/**
 * Mental stress (the Toolbox's sample effects): each creature saves against the DC, and takes the
 * Psychic damage in d6s on a failure — on a success none, or half, as the DM chose.
 */
export function decideInflictMentalStress(
  context: DecisionContext,
  command: KernelCommandOf<'InflictMentalStress'>,
  dice: Dice,
): Decision {
  const { state } = context;
  const caught = caughtCreatures(state, command.targetIds);
  if (!caught.ok) return caught.decision;
  const events: DraftEvent[] = [];
  for (const target of caught.targets) {
    events.push(combatPremises(state, target.entityId));
    const save = spellSave(dice, target, command.ability, command.dc, 'none', 'hazard');
    events.push(save.event);
    const roll = rollDamage(dice, command.dice, 6, 0);
    const amount = !save.success
      ? roll.total
      : command.onSuccess === 'half'
        ? Math.floor(roll.total / 2)
        : 0;
    const after = harm(
      state,
      dice,
      { vitals: target, events: [], dead: false },
      amount,
      'psychic',
      roll.rolls,
    );
    events.push(...after.events);
  }
  return accept(...events);
}
