import type { CharacterSheet, ReactionId } from '@ltw/contracts';
import {
  REACTION_WINDOW_ID_INDEX,
  combatantOf,
  openReactionWindow,
  type CombatantRecord,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type EncounterState,
  type ReactionTrigger,
  type ReactionWindowRecord,
  type WorldState,
} from '@ltw/domain';
import {
  SHIELD_AC_BONUS,
  applyCast,
  attackRoll,
  checkCast,
  hasUncannyDodge,
  rollDamage,
  slotsRemaining,
  squareDistanceFt,
  type TurnState,
} from '@ltw/rules';

import type { MadeAttack } from '../attack.ts';
import { combatantEvent, isAlive, turnStateOf } from '../battlefield.ts';
import { applyDamage } from '../damage.ts';
import type { AttackPlan, Refusal } from '../legality.ts';
import { applied as masteryApplied, masteryOnHit } from '../masteries.ts';
import {
  has,
  incapacitated,
  vitalsEvent,
  vitalsOf,
  withConditions,
  type Vitals,
} from '../vitals.ts';

/**
 * An attack's windows (docs/adr/0046-reactions-beyond-counterspell.md §3–4): after its d20, a
 * missed attack its inspired attacker may roll again; a hit its target may answer with Shield or
 * Uncanny Dodge, its damage rolled first; damage done, the creature it struck may rebuke the
 * attacker. Each window has one candidate and waits; the attack goes on when it closes. A window
 * opened while another is open — an opportunity attack's — waits inside it.
 */
export type AttackTrigger = Extract<ReactionTrigger, { kind: 'attack' }>;
export type AttackSpec = AttackTrigger['spec'];

/** What a reroll needs again, and the hit its damage: kept in the window. */
export const specOf = (plan: AttackPlan): AttackSpec => ({
  bonus: plan.bonus,
  armorClass: plan.targetAc,
  advantage: plan.advantage,
  disadvantage: plan.disadvantage,
  criticalOnHit: plan.criticalOnHit,
  cover: plan.cover,
  damage: { ...plan.damage },
  advantageDamage: plan.advantageDamage ? { ...plan.advantageDamage } : null,
  huntersMark: plan.huntersMark,
  slow: plan.slow,
  ...(plan.mastery ? { mastery: { ...plan.mastery } } : {}),
  melee: plan.melee,
});

export interface Rolled {
  readonly rolls: readonly number[];
  readonly natural: number;
  readonly total: number;
  readonly hit: boolean;
  readonly critical: boolean;
}

/** The d20 against the target's AC; a Critical Hit on a natural 20 or a hit the rules make one. */
export function rollAgainst(dice: Dice, spec: AttackSpec): Rolled {
  const roll = attackRoll(dice, {
    modifier: spec.bonus,
    target: spec.armorClass,
    advantage: spec.advantage,
    disadvantage: spec.disadvantage,
  });
  const hit = roll.success;
  return {
    rolls: roll.rolls,
    natural: roll.natural,
    total: roll.total,
    hit,
    critical: hit && (roll.critical || spec.criticalOnHit),
  };
}

/** A hit's damage: the weapon's dice, the Advantage die, Hunter's Mark — doubled on a Critical Hit. */
export function damageOf(dice: Dice, spec: AttackSpec, critical: boolean) {
  const { damage } = spec;
  const parts = [rollDamage(dice, damage.count, damage.sides, damage.bonus, critical)];
  if (spec.advantageDamage && spec.advantage && !spec.disadvantage) {
    const extra = spec.advantageDamage;
    parts.push(rollDamage(dice, extra.count, extra.sides, extra.bonus, critical));
  }
  if (spec.huntersMark) parts.push(rollDamage(dice, 1, 6, 0, critical));
  return {
    amount: parts.reduce((total, part) => total + part.total, 0),
    rolls: parts.flatMap((part) => [...part.rolls]),
  };
}

/** A reaction spell's payment: the lowest slot that casts it, the sheet and turn after. */
export interface Payment {
  readonly legal: true;
  readonly record: CombatantRecord;
  readonly slotLevel: number;
  readonly saveDc: number;
  readonly sheet: CharacterSheet;
  readonly turn: TurnState;
}

const refuse = (reason: Refusal['reason']): Refusal => ({ legal: false, reason });

function castReaction(
  encounter: EncounterState,
  vitals: Vitals | null,
  record: CombatantRecord | undefined,
  spellId: 'shield' | 'hellish-rebuke',
  target?: { readonly distanceFt: number; readonly visible: boolean },
): Payment | Refusal {
  if (vitals?.kind !== 'character' || !record) return refuse('NOT_KNOWN');
  const turn = turnStateOf(encounter, record);
  const slotLevel =
    [1, 2, 3, 4, 5, 6, 7, 8, 9].find((level) => slotsRemaining(vitals.sheet, level) > 0) ?? 1;
  const plan = checkCast(vitals.sheet, turn, {
    spellId,
    using: { slotLevel },
    ...(target ? { target } : {}),
  });
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

/** Heroic Inspiration's reroll: an inspired character's missed attack. */
export const mayReroll = (state: WorldState, attackerId: string): boolean => {
  const vitals = vitalsOf(state, attackerId);
  return (
    vitals?.kind === 'character' &&
    vitals.sheet.heroicInspiration === true &&
    isAlive(state, attackerId)
  );
};

/** Shield, when +5 AC would turn this hit into a miss: never against a natural 20. */
export function shieldPlan(
  state: WorldState,
  encounter: EncounterState,
  targetId: string,
  roll: { readonly natural: number; readonly total: number; readonly armorClass: number },
  vitals: Vitals | null = vitalsOf(state, targetId),
): Payment | Refusal {
  if (roll.natural === 20 || roll.total >= roll.armorClass + SHIELD_AC_BONUS) {
    return refuse('NO_VALID_TRIGGER');
  }
  return castReaction(encounter, vitals, combatantOf(encounter, targetId), 'shield');
}

/** Uncanny Dodge (Rogue 5): its Reaction, against an attacker it can see. */
export function dodgePlan(
  state: WorldState,
  encounter: EncounterState,
  targetId: string,
  attackerId: string,
): { readonly legal: true; readonly record: CombatantRecord } | Refusal {
  const vitals = vitalsOf(state, targetId);
  const record = combatantOf(encounter, targetId);
  const attacker = vitalsOf(state, attackerId);
  if (vitals?.kind !== 'character' || !record || !hasUncannyDodge(vitals.sheet)) {
    return refuse('NOT_KNOWN');
  }
  if (!isAlive(state, targetId) || incapacitated(vitals)) return refuse('INCAPACITATED');
  if (!turnStateOf(encounter, record).reactionAvailable) return refuse('NO_REACTION');
  if (has(vitals, 'blinded') || (attacker && has(attacker, 'invisible'))) {
    return refuse('TARGET_NOT_VISIBLE');
  }
  return { legal: true, record };
}

/** Hellish Rebuke at the creature that damaged it: within 60 ft, seen, with a slot. */
export function rebukePlan(
  state: WorldState,
  encounter: EncounterState,
  reactorId: string,
  sourceId: string,
  vitals: Vitals | null = vitalsOf(state, reactorId),
): Payment | Refusal {
  const record = combatantOf(encounter, reactorId);
  const source = combatantOf(encounter, sourceId);
  const seen = vitalsOf(state, sourceId);
  if (!record || !source || !seen || !isAlive(state, sourceId)) return refuse('NOT_A_COMBATANT');
  const visible = !(vitals && has(vitals, 'blinded')) && !has(seen, 'invisible');
  return castReaction(encounter, vitals, record, 'hellish-rebuke', {
    distanceFt: squareDistanceFt(record.position, source.position),
    visible,
  });
}

/**
 * Opens a window. One already open — the window this command answers — waits inside it; a
 * window opened as one closes waits under that one's parent (`nestUnder`).
 */
export function openWindow(
  context: DecisionContext,
  state: WorldState,
  trigger: ReactionTrigger,
  candidates: readonly { readonly entityId: string; readonly reactions: readonly ReactionId[] }[],
  ids: readonly string[],
  nestUnder?: string,
): DraftEvent[] {
  const encounter = state.encounter;
  const windowId = ids[REACTION_WINDOW_ID_INDEX];
  if (!encounter || windowId === undefined) {
    throw new Error('a reaction window opened without an encounter or a window ID');
  }
  const open = openReactionWindow(state);
  const parentWindowId = open?.windowId ?? nestUnder;
  const window: ReactionWindowRecord = {
    windowId,
    encounterId: encounter.encounterId,
    round: encounter.round,
    status: 'open',
    trigger,
    candidates: candidates.map(({ entityId, reactions }) => ({
      entityId,
      response: 'pending',
      reactions: [...reactions],
    })),
    ineligible: [],
    openedBy: context.commandId,
    closedBy: null,
    ...(parentWindowId === undefined ? {} : { parentWindowId }),
  };
  return [
    ...(open
      ? [{ type: 'ReactionWindowWaiting' as const, payload: { windowId: open.windowId } }]
      : []),
    { type: 'ReactionWindowOpened', payload: { window } },
  ];
}

/** The attack a window holds, as made. */
export const madeOf = (trigger: AttackTrigger): MadeAttack => ({
  attackerId: trigger.attackerId,
  targetId: trigger.targetId,
  attackId: trigger.attackId,
  ...(trigger.by === undefined ? {} : { by: trigger.by }),
});

const triggerOf = (
  made: MadeAttack,
  spec: AttackSpec,
  rolled: Rolled,
  phase: AttackTrigger['phase'],
  damage: AttackTrigger['damage'],
): AttackTrigger => ({
  kind: 'attack',
  attackerId: made.attackerId,
  targetId: made.targetId,
  attackId: made.attackId,
  ...(made.by === undefined ? {} : { by: made.by }),
  phase,
  spec,
  natural: rolled.natural,
  total: rolled.total,
  critical: rolled.critical,
  damage,
});

/** After the d20: a reroll's window for an inspired miss; a hit's window, or the hit itself. */
export function afterRoll(
  context: DecisionContext,
  state: WorldState,
  dice: Dice,
  ids: readonly string[],
  made: MadeAttack,
  spec: AttackSpec,
  rolled: Rolled,
  nestUnder?: string,
): DraftEvent[] {
  const encounter = state.encounter;
  if (!encounter) return [];
  if (!rolled.hit) {
    if (!mayReroll(state, made.attackerId)) {
      return missEvents(context, state, dice, ids, made, spec, nestUnder);
    }
    const trigger = triggerOf(made, spec, rolled, 'missed', null);
    const asked = [
      { entityId: made.attackerId, reactions: ['inspiration-reroll'] as ReactionId[] },
    ];
    return openWindow(context, state, trigger, asked, ids, nestUnder);
  }
  const damage = damageOf(dice, spec, rolled.critical);
  const reactions: ReactionId[] = [];
  const roll = { natural: rolled.natural, total: rolled.total, armorClass: spec.armorClass };
  if (shieldPlan(state, encounter, made.targetId, roll).legal) reactions.push('shield');
  if (dodgePlan(state, encounter, made.targetId, made.attackerId).legal) {
    reactions.push('uncanny-dodge');
  }
  if (reactions.length > 0) {
    const trigger = triggerOf(made, spec, rolled, 'hit', damage);
    return openWindow(
      context,
      state,
      trigger,
      [{ entityId: made.targetId, reactions }],
      ids,
      nestUnder,
    );
  }
  return hitEvents(
    context,
    state,
    dice,
    ids,
    made,
    spec,
    rolled.critical,
    damage,
    false,
    nestUnder,
  );
}

/** Damage done, a rebuke's window when the creature struck can answer the attacker so (§4). */
function rebukeWindow(
  context: DecisionContext,
  state: WorldState,
  ids: readonly string[],
  made: MadeAttack,
  amount: number,
  struck: Vitals,
  nestUnder?: string,
): DraftEvent[] {
  const encounter = state.encounter;
  if (!encounter || amount <= 0) return [];
  if (!rebukePlan(state, encounter, made.targetId, made.attackerId, struck).legal) return [];
  const trigger: ReactionTrigger = {
    kind: 'damage',
    sourceId: made.attackerId,
    damaged: [{ entityId: made.targetId, amount }],
  };
  const asked = [{ entityId: made.targetId, reactions: ['hellish-rebuke'] as ReactionId[] }];
  return openWindow(context, state, trigger, asked, ids, nestUnder);
}

const died = (events: readonly DraftEvent[]) =>
  events.some((event) => event.type === 'EntityStatusChanged' && event.payload.to === 'dead');

/**
 * A miss that stays one: Graze deals the attack's ability modifier as the weapon's damage
 * (docs/adr/0047-weapons.md §2).
 */
export function missEvents(
  context: DecisionContext,
  state: WorldState,
  dice: Dice,
  ids: readonly string[],
  made: MadeAttack,
  spec: AttackSpec,
  nestUnder?: string,
): DraftEvent[] {
  const graze = spec.mastery?.kind === 'graze' ? (spec.mastery.graze ?? 0) : 0;
  const vitals = vitalsOf(state, made.targetId);
  if (graze <= 0 || !vitals) return [];
  const dealt = applyDamage(state, dice, vitals, {
    sourceId: made.attackerId,
    amount: graze,
    damageType: spec.damage.type,
    rolls: [],
    critical: false,
  });
  return [
    masteryApplied(made, 'graze'),
    ...dealt.events,
    ...(died(dealt.events)
      ? []
      : rebukeWindow(context, state, ids, made, graze, dealt.vitals, nestUnder)),
  ];
}

/**
 * A hit lands: its damage (halved by Uncanny Dodge), the Slow mastery and the others
 * (docs/adr/0047-weapons.md §2), and — the damage done — a rebuke's window when the creature
 * struck can answer the attacker so.
 */
export function hitEvents(
  context: DecisionContext,
  state: WorldState,
  dice: Dice,
  ids: readonly string[],
  made: MadeAttack,
  spec: AttackSpec,
  critical: boolean,
  damage: { readonly amount: number; readonly rolls: readonly number[] },
  halved: boolean,
  nestUnder?: string,
): DraftEvent[] {
  const encounter = state.encounter;
  const vitals = vitalsOf(state, made.targetId);
  if (!encounter || !vitals) return [];
  const amount = halved ? Math.floor(damage.amount / 2) : damage.amount;
  const applied = applyDamage(state, dice, vitals, {
    sourceId: made.attackerId,
    amount,
    damageType: spec.damage.type,
    rolls: damage.rolls,
    critical,
  });
  const events: DraftEvent[] = [...applied.events];
  const dead = died(applied.events);
  const target = combatantOf(encounter, made.targetId);
  // Slow and Vex need the hit to deal damage (SRD 5.2.1).
  if (spec.slow && amount > 0 && !dead && target) {
    events.push(
      {
        type: 'ConditionApplied',
        payload: {
          targetId: made.targetId,
          condition: 'slowed',
          applied: true,
          cause: 'slow-mastery',
        },
      },
      vitalsEvent(withConditions(applied.vitals, ['slowed'], [])),
      combatantEvent({ ...target, slowedBy: made.attackerId }),
    );
  }
  if (spec.mastery && !dead) {
    events.push(...masteryOnHit(state, dice, made, spec.mastery, applied.vitals, amount));
  }
  if (!dead) {
    events.push(...rebukeWindow(context, state, ids, made, amount, applied.vitals, nestUnder));
  }
  return events;
}
