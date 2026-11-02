import { MAX_EXHAUSTION, type ConditionDetails, type KernelCommandOf } from '@ltw/contracts';
import {
  accept,
  premisesEvent,
  reject,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type WorldState,
} from '@ltw/domain';
import { conditionBlocked, incapacitatedBy } from '@ltw/rules';

import { combatantEvent } from './battlefield.ts';
import { detailOf, withDetail } from './condition-details.ts';
import { applyDamage, applyHealing, statusDead } from './damage.ts';
import { fallEvents, fallsAfterHarm, grounded, killedIn } from './falling.ts';
import { isObject } from './objects.ts';
import {
  ceilingOf,
  conditionsOf,
  exhaustionOf,
  has,
  hitPoints,
  vitalsEvent,
  vitalsOf,
  withAllHitPoints,
  withConditions,
  withExhaustion,
  withHitPoints,
  withSheet,
  type Vitals,
} from './vitals.ts';

/**
 * The DM's hand (docs/adr/0043-dm-screen.md §1): damage or healing, a condition, Exhaustion,
 * Heroic Inspiration — on a character or a creature, in a fight or not — through the same rules a fight
 * uses: dying and death saves, massive damage, a Concentration save, regaining consciousness.
 * The DM's reason stays with the stored command for the DM's history; the narrative record of a
 * change of hit points is the DM's (`HitPointsAdjusted`), never a creature's attack.
 *
 * Each decision reads the target's vitals (a premise), so undoing an earlier change of the same
 * creature after this one is refused as unsafe instead of silently wiping this one.
 */
type Target =
  | { readonly ok: true; readonly vitals: NonNullable<ReturnType<typeof vitalsOf>> }
  | { readonly ok: false; readonly decision: Decision };

function living(state: WorldState, entityId: string): Target {
  const entity = state.entities.get(entityId);
  if (!entity) return { ok: false, decision: reject('ENTITY_NOT_FOUND', 'No such creature') };
  if (entity.status !== 'active')
    return { ok: false, decision: reject('TARGET_DEAD', 'TARGET_DEAD') };
  const vitals = vitalsOf(state, entityId);
  if (!vitals)
    return { ok: false, decision: reject('NO_STAT_BLOCK', 'It has no sheet or stat block') };
  return { ok: true, vitals };
}

const readsVitals = (entityId: string): DraftEvent =>
  premisesEvent(entityId, [{ kind: 'vitals', entityId }]);

export function decideAdjustHitPoints(
  context: DecisionContext,
  command: KernelCommandOf<'AdjustHitPoints'>,
  dice: Dice,
): Decision {
  const { state } = context;
  const target = living(state, command.targetId);
  if (!target.ok) return target.decision;
  const before = hitPoints(target.vitals).current;
  if (command.change === 'temporary' || command.change === 'reduce-maximum') {
    return handHitPoints(state, command, target.vitals);
  }
  if (command.change === 'damage') {
    if (command.damageType === undefined) return reject('INVALID_COMMAND', 'Damage names its type');
    const applied = applyDamage(state, dice, target.vitals, {
      sourceId: command.targetId,
      amount: command.amount,
      damageType: command.damageType,
      rolls: [],
      critical: false,
    });
    // The pipeline's first record is a creature's DamageApplied: the DM's own replaces it.
    const [, ...harm] = applied.events;
    // A flyer the damage leaves unable to stay aloft falls (docs/adr/0049-space-and-movement.md §6).
    const record = state.encounter?.combatants.find((c) => c.entityId === command.targetId);
    const dead = killedIn(harm, command.targetId);
    const effects = record
      ? [...harm, ...fallsAfterHarm(state, dice, harm, record, applied.vitals, dead)]
      : harm;
    return accept(
      readsVitals(command.targetId),
      {
        type: 'HitPointsAdjusted',
        payload: {
          targetId: command.targetId,
          change: 'damage',
          amount: command.amount,
          damageType: command.damageType,
          hpBefore: before,
          hpAfter: hitPoints(applied.vitals).current,
        },
      },
      ...effects,
    );
  }
  if (command.damageType !== undefined)
    return reject('INVALID_COMMAND', 'Healing has no damage type');
  if (before >= ceilingOf(target.vitals)) return reject('NO_EFFECT', 'Already at full health');
  const applied = applyHealing(target.vitals, {
    sourceId: command.targetId,
    amount: command.amount,
    rolls: [],
  });
  const [, ...effects] = applied.events;
  return accept(
    readsVitals(command.targetId),
    {
      type: 'HitPointsAdjusted',
      payload: {
        targetId: command.targetId,
        change: 'healing',
        amount: hitPoints(applied.vitals).current - before,
        hpBefore: before,
        hpAfter: hitPoints(applied.vitals).current,
      },
    },
    ...effects,
  );
}

/**
 * Temporary hit points given, or the maximum lowered, by the DM's hand (docs/adr/0048-hit-points.md
 * §1–2): temporary ones never stack — the higher stays; a maximum lowered to 0 kills.
 */
function handHitPoints(
  state: WorldState,
  command: KernelCommandOf<'AdjustHitPoints'>,
  vitals: Vitals,
): Decision {
  if (command.damageType !== undefined)
    return reject('INVALID_COMMAND', 'Only damage has a damage type');
  const hp = hitPoints(vitals);
  if (command.change === 'temporary') {
    if ((hp.temporary ?? 0) >= command.amount)
      return reject('NO_EFFECT', 'It holds as many temporary hit points already');
    const next = withAllHitPoints(vitals, { ...hp, temporary: command.amount });
    return accept(
      readsVitals(command.targetId),
      adjusted(command, hp.current, hp.current),
      vitalsEvent(next),
    );
  }
  const reducedBy = Math.min(hp.max, (hp.reducedBy ?? 0) + command.amount);
  const ceiling = hp.max - reducedBy;
  const current = Math.min(hp.current, ceiling);
  const next = withAllHitPoints(vitals, { ...hp, reducedBy, current });
  return accept(
    readsVitals(command.targetId),
    adjusted(command, hp.current, current),
    vitalsEvent(next),
    ...(ceiling === 0 ? statusDead(state, command.targetId) : []),
  );
}

const adjusted = (
  command: KernelCommandOf<'AdjustHitPoints'>,
  hpBefore: number,
  hpAfter: number,
): DraftEvent => ({
  type: 'HitPointsAdjusted',
  payload: {
    targetId: command.targetId,
    change: command.change,
    amount: command.amount,
    hpBefore,
    hpAfter,
  },
});

/** A condition's details as one comparable string, whatever order their fields came in. */
const detailKey = (details: ConditionDetails | undefined): string =>
  JSON.stringify([
    details?.sourceId ?? null,
    details?.until ? [details.until.turnOf, details.until.at, details.until.turns] : null,
    details?.save ? [details.save.ability, details.save.dc] : null,
  ]);

/**
 * A condition set or lifted by hand (docs/adr/0045-conditions-and-actions.md §1–2). Applied in a
 * fight, it may carry how it ends and its source; applied again, only those change. Unconscious
 * brings Prone with it; Incapacitated, and what includes it, ends Concentration; a Petrified
 * creature cannot be Poisoned.
 */
export function decideSetCondition(
  context: DecisionContext,
  command: KernelCommandOf<'SetCondition'>,
  dice: Dice,
): Decision {
  const { state } = context;
  const target = living(state, command.targetId);
  if (!target.ok) return target.decision;
  const { vitals } = target;
  // Conditions are a creature's (docs/adr/0048-hit-points.md §5).
  if (isObject(vitals)) return reject('NO_EFFECT', 'An object takes no condition');
  const { condition, applied } = command;
  const encounter = state.encounter;
  const combatant = encounter?.combatants.find((c) => c.entityId === command.targetId);
  const details = command.details;
  if (details) {
    if (!applied) return reject('INVALID_COMMAND', 'How a condition ends comes with applying it');
    if (condition === 'slowed') return reject('INVALID_COMMAND', 'Slowed ends by its own rule');
    if (!encounter || !combatant) {
      return reject('INVALID_COMMAND', 'A duration, a save or a source needs a fight');
    }
    const named = [details.sourceId, details.until?.turnOf];
    if (
      named.some((id) => id !== undefined && !encounter.combatants.some((c) => c.entityId === id))
    )
      return reject('NOT_A_COMBATANT', 'NOT_A_COMBATANT');
    if (details.sourceId === command.targetId)
      return reject('INVALID_COMMAND', 'A creature is not the source of its own condition');
  }
  if (has(vitals, condition) === applied) {
    // Applied again in a fight: only how it ends, or its source, changes.
    if (
      !applied ||
      !combatant ||
      detailKey(detailOf(combatant, condition)) === detailKey(details)
    ) {
      return reject('NO_EFFECT', 'Nothing changes');
    }
    return accept(
      readsVitals(command.targetId),
      combatantEvent(withDetail(combatant, condition, details ?? null)),
    );
  }
  if (applied && conditionBlocked(condition, conditionsOf(vitals)))
    return reject('NO_EFFECT', 'It cannot take hold');
  // A creature at 0 hit points stays Unconscious until it is healed or stabilised by its rules.
  if (condition === 'unconscious' && !applied && hitPoints(vitals).current === 0)
    return reject('ILLEGAL_ACTION', 'AT_ZERO_HIT_POINTS', { reason: 'AT_ZERO_HIT_POINTS' });
  const record = (name: typeof condition): DraftEvent => ({
    type: 'ConditionApplied',
    payload: { targetId: command.targetId, condition: name, applied, cause: 'dm' },
  });
  const events: DraftEvent[] = [readsVitals(command.targetId), record(condition)];
  let next = applied
    ? withConditions(vitals, [condition], [])
    : withConditions(vitals, [], [condition]);
  // Unconscious brings Prone with it (SRD 5.2.1), as falling to 0 hit points does.
  if (condition === 'unconscious' && applied && !has(vitals, 'prone')) {
    next = withConditions(next, ['prone'], []);
    events.push(record('prone'));
  }
  // Incapacitated, or a condition that includes it, ends Concentration (ADR 0045 §1).
  if (applied && incapacitatedBy(conditionsOf(next))) {
    next = withSheet(next, (sheet) => ({ ...sheet, concentration: null }));
  }
  events.push(vitalsEvent(next));
  if (combatant) {
    // Slowed lifted by hand no longer waits for its slowing creature's turn.
    let after =
      condition === 'slowed' && !applied && combatant.slowedBy !== null
        ? { ...combatant, slowedBy: null }
        : combatant;
    after = withDetail(after, condition, applied ? (details ?? null) : null);
    const changed =
      after.slowedBy !== combatant.slowedBy ||
      detailKey(detailOf(after, condition)) !== detailKey(detailOf(combatant, condition));
    // A flyer that can no longer stay aloft falls (docs/adr/0049-space-and-movement.md §6).
    const height = after.altitudeFt ?? 0;
    if (height > 0 && grounded(next)) {
      const landed = { ...after };
      delete landed.altitudeFt;
      events.push(combatantEvent(landed), ...fallEvents(state, dice, next, height).events);
    } else if (changed) events.push(combatantEvent(after));
  }
  return accept(...events);
}

/**
 * Exhaustion's level set by hand (ADR 0045 §3): 0 lifts it; level 6 kills — a character dies as
 * from three failed death saves, a creature drops dead.
 */
export function decideSetExhaustion(
  context: DecisionContext,
  command: KernelCommandOf<'SetExhaustion'>,
): Decision {
  const { state } = context;
  const target = living(state, command.targetId);
  if (!target.ok) return target.decision;
  const { vitals } = target;
  if (isObject(vitals)) return reject('NO_EFFECT', 'An object takes no condition');
  if (exhaustionOf(vitals) === command.level) return reject('NO_EFFECT', 'Nothing changes');
  let next = withExhaustion(vitals, command.level);
  if (command.level < MAX_EXHAUSTION)
    return accept(readsVitals(command.targetId), vitalsEvent(next));
  next = withSheet(withHitPoints(next, 0), (sheet) => ({ ...sheet, concentration: null }));
  return accept(
    readsVitals(command.targetId),
    vitalsEvent(next),
    ...statusDead(state, command.targetId),
  );
}

export function decideSetInspiration(
  context: DecisionContext,
  command: KernelCommandOf<'SetInspiration'>,
): Decision {
  const { state } = context;
  const target = living(state, command.characterId);
  if (!target.ok) return target.decision;
  const { vitals } = target;
  if (vitals.kind !== 'character')
    return reject('INVALID_COMMAND', 'Heroic Inspiration is a character’s');
  if ((vitals.sheet.heroicInspiration === true) === command.inspired)
    return reject('NO_EFFECT', 'Nothing changes');
  const next = withSheet(vitals, (sheet) => {
    if (command.inspired) return { ...sheet, heroicInspiration: true };
    // None held: the field is absent, as on a sheet that never had it.
    const without = { ...sheet };
    delete without.heroicInspiration;
    return without;
  });
  return accept(readsVitals(command.characterId), vitalsEvent(next));
}

/**
 * Heroic Inspiration spent by its holder (docs/adr/0046-reactions-beyond-counterspell.md §6): the
 * table rolls the player's check again, and the new roll counts.
 */
export function decideSpendInspiration(
  context: DecisionContext,
  command: KernelCommandOf<'SpendInspiration'>,
): Decision {
  const { state } = context;
  const target = living(state, command.characterId);
  if (!target.ok) return target.decision;
  const { vitals } = target;
  if (vitals.kind !== 'character' || vitals.sheet.heroicInspiration !== true) {
    return reject('NO_EFFECT', 'No Heroic Inspiration to spend');
  }
  const next = withSheet(vitals, (sheet) => {
    const without = { ...sheet };
    delete without.heroicInspiration;
    return without;
  });
  return accept(readsVitals(command.characterId), vitalsEvent(next));
}
