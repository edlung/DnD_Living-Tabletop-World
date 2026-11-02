import {
  accept,
  combatantOf,
  type CombatCommand,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type EncounterState,
  type ReactionWindowRecord,
} from '@ltw/domain';
import { HELLISH_REBUKE_DICE, rollDamage } from '@ltw/rules';

import { resolveAttack } from '../attack.ts';
import { combatantEvent, coverOf, turnStateOf, withTurn } from '../battlefield.ts';
import { applyDamage } from '../damage.ts';
import { attackPlan } from '../legality.ts';
import { combatPremises, refused } from '../refusal.ts';
import { spellSave } from '../saves.ts';
import { vitalsEvent, vitalsOf } from '../vitals.ts';
import {
  afterRoll,
  dodgePlan,
  hitEvents,
  madeOf,
  rebukePlan,
  rollAgainst,
  shieldPlan,
} from './attack-windows.ts';
import { counterspellPlan } from './eligibility.ts';
import { opportunityPlan } from './opportunity.ts';
import { finish } from './settle.ts';

/**
 * Each reaction's answer to its window (docs/adr/0016-reaction-engine.md;
 * docs/adr/0046-reactions-beyond-counterspell.md): checked again by the rules, paid, recorded,
 * and what the window held goes on as the answer makes it.
 */
type Use = Extract<CombatCommand, { type: 'UseReaction' }>;

const noTrigger = () => refused({ legal: false, reason: 'NO_VALID_TRIGGER' });
const used = (window: ReactionWindowRecord, command: Use, slotLevel?: number): DraftEvent => ({
  type: 'ReactionUsed',
  payload: {
    windowId: window.windowId,
    reactorId: command.combatantId,
    reaction: command.reaction,
    ...(slotLevel === undefined ? {} : { slotLevel }),
    ...(command.attackId === undefined ? {} : { attackId: command.attackId }),
  },
});
const cast = (casterId: string, spellId: string, slotLevel: number, targetId: string | null) =>
  ({
    type: 'SpellCast',
    payload: { casterId, spellId, slotLevel, free: false, targetId, point: null },
  }) as const;

export function answerCounterspell(
  context: DecisionContext,
  command: Use,
  window: ReactionWindowRecord,
  encounter: EncounterState,
  dice: Dice,
): Decision {
  const { state } = context;
  if (window.trigger.kind !== 'spell') return noTrigger();
  const { casterId, components } = window.trigger;
  const plan = counterspellPlan(
    state,
    encounter,
    command.combatantId,
    casterId,
    components,
    command.using,
  );
  if (!plan.legal) return refused(plan);
  const caster = vitalsOf(state, casterId);
  if (!caster) throw new Error(`reaction trigger caster ${casterId} has no vitals`);
  const events: DraftEvent[] = [
    combatPremises(state, command.combatantId),
    used(window, command, plan.slotLevel),
    cast(command.combatantId, 'counterspell', plan.slotLevel, casterId),
    vitalsEvent({ kind: 'character', entityId: command.combatantId, sheet: plan.sheet }),
    combatantEvent(withTurn(plan.record, plan.turn)),
  ];
  // The caster's Constitution save against the reactor's spell save DC (ADR 0011).
  const save = spellSave(dice, caster, 'con', plan.saveDc, 'none', 'counterspell');
  events.push(save.event);
  if (!save.success) {
    events.push({
      type: 'ReactionWindowResolved',
      payload: { windowId: window.windowId, outcome: 'countered' },
    });
    return accept(...events);
  }
  const ids = command.resolution?.ids ?? [];
  return accept(...finish(context, command.type, window, [command.combatantId], events, dice, ids));
}

/**
 * An opportunity attack (ADR 0046 §2): one melee attack against the creature leaving reach, as it
 * stands on the last square inside it, paid with the Reaction and resolved at once — its own
 * window, if its roll or hit asks one, waiting inside this one.
 */
export function answerOpportunity(
  context: DecisionContext,
  command: Use,
  window: ReactionWindowRecord,
  encounter: EncounterState,
  dice: Dice,
): Decision {
  const { state } = context;
  if (window.trigger.kind !== 'move') return noTrigger();
  const { moverId } = window.trigger;
  const reactorId = command.combatantId;
  const allowed = opportunityPlan(state, encounter, reactorId, moverId);
  if (!allowed.legal) return refused(allowed);
  const attackId = command.attackId ?? allowed.attacks[0]?.attackId;
  if (attackId === undefined || !allowed.attacks.some((a) => a.attackId === attackId)) {
    return refused({ legal: false, reason: 'NO_WEAPON' });
  }
  const plan = attackPlan(state, encounter, reactorId, attackId, moverId, 'reaction');
  if (!plan.legal) return refused(plan);
  const ids = command.resolution?.ids ?? [];
  const { events, attacker, outcome } = resolveAttack(
    context,
    state,
    encounter,
    dice,
    ids,
    plan,
    { attackerId: reactorId, targetId: moverId, attackId, by: 'opportunity' },
    plan.turn,
  );
  const answered: DraftEvent[] = [
    combatPremises(state, reactorId),
    used(window, { ...command, attackId }),
    ...events,
    combatantEvent(attacker),
    ...outcome,
  ];
  return accept(...finish(context, command.type, window, [reactorId], answered, dice, ids));
}

/**
 * Heroic Inspiration (ADR 0046 §3): the attacker spends it to roll its missed attack's d20 again
 * and must use the new roll, which goes on as any roll does.
 */
export function answerReroll(
  context: DecisionContext,
  command: Use,
  window: ReactionWindowRecord,
  dice: Dice,
): Decision {
  const { state } = context;
  const { trigger } = window;
  if (trigger.kind !== 'attack' || trigger.phase !== 'missed') return noTrigger();
  const vitals = vitalsOf(state, command.combatantId);
  if (
    command.combatantId !== trigger.attackerId ||
    vitals?.kind !== 'character' ||
    vitals.sheet.heroicInspiration !== true
  ) {
    return noTrigger();
  }
  const sheet = { ...vitals.sheet };
  delete sheet.heroicInspiration;
  const rolled = rollAgainst(dice, trigger.spec);
  const made = madeOf(trigger);
  const { spec } = trigger;
  const events: DraftEvent[] = [
    combatPremises(state, command.combatantId),
    used(window, command),
    vitalsEvent({ kind: 'character', entityId: command.combatantId, sheet }),
    {
      type: 'AttackPerformed',
      payload: {
        attackerId: made.attackerId,
        targetId: made.targetId,
        attackId: made.attackId,
        rolls: [...rolled.rolls],
        modifier: spec.bonus,
        total: rolled.total,
        advantage: spec.advantage,
        disadvantage: spec.disadvantage,
        cover: spec.cover,
        critical: rolled.critical,
        hit: rolled.hit,
        ...(made.by === undefined ? {} : { by: made.by }),
        rerolled: true,
      },
    },
  ];
  const ids = command.resolution?.ids ?? [];
  return accept(
    ...finish(context, command.type, window, [command.combatantId], events, dice, ids, (after) =>
      afterRoll(context, after, dice, ids, made, spec, rolled, window.parentWindowId),
    ),
  );
}

/** Shield (ADR 0046 §3): +5 AC until its next turn starts, and this hit misses. */
export function answerShield(
  context: DecisionContext,
  command: Use,
  window: ReactionWindowRecord,
  encounter: EncounterState,
  dice: Dice,
): Decision {
  const { state } = context;
  const { trigger } = window;
  if (trigger.kind !== 'attack' || trigger.phase !== 'hit') return noTrigger();
  if (command.combatantId !== trigger.targetId) return noTrigger();
  const pay = shieldPlan(state, encounter, trigger.targetId, {
    natural: trigger.natural,
    total: trigger.total,
    armorClass: trigger.spec.armorClass,
  });
  if (!pay.legal) return refused(pay);
  const shielded = withTurn(pay.record, pay.turn);
  const events: DraftEvent[] = [
    combatPremises(state, command.combatantId),
    used(window, command, pay.slotLevel),
    cast(command.combatantId, 'shield', pay.slotLevel, null),
    vitalsEvent({ kind: 'character', entityId: command.combatantId, sheet: pay.sheet }),
    combatantEvent({ ...shielded, turn: { ...shielded.turn, shielded: true } }),
  ];
  const ids = command.resolution?.ids ?? [];
  // The hit misses: nothing lands.
  return accept(
    ...finish(context, command.type, window, [command.combatantId], events, dice, ids, () => []),
  );
}

/** Uncanny Dodge (ADR 0046 §3): the rogue's Reaction halves the hit's damage. */
export function answerDodge(
  context: DecisionContext,
  command: Use,
  window: ReactionWindowRecord,
  encounter: EncounterState,
  dice: Dice,
): Decision {
  const { state } = context;
  const { trigger } = window;
  if (trigger.kind !== 'attack' || trigger.phase !== 'hit' || trigger.damage === null) {
    return noTrigger();
  }
  const damage = trigger.damage;
  if (command.combatantId !== trigger.targetId) return noTrigger();
  const pay = dodgePlan(state, encounter, trigger.targetId, trigger.attackerId);
  if (!pay.legal) return refused(pay);
  const turn = { ...turnStateOf(encounter, pay.record), reactionAvailable: false };
  const events: DraftEvent[] = [
    combatPremises(state, command.combatantId),
    used(window, command),
    combatantEvent(withTurn(pay.record, turn)),
  ];
  const ids = command.resolution?.ids ?? [];
  return accept(
    ...finish(context, command.type, window, [command.combatantId], events, dice, ids, (after) =>
      hitEvents(
        context,
        after,
        dice,
        ids,
        madeOf(trigger),
        trigger.spec,
        trigger.critical,
        damage,
        true,
        window.parentWindowId,
      ),
    ),
  );
}

/**
 * Hellish Rebuke (ADR 0046 §4): 2d10 Fire at the creature that did the damage, 1d10 more for each
 * slot level above 1, a Dexterity save for half against the reactor's spell save DC.
 */
export function answerRebuke(
  context: DecisionContext,
  command: Use,
  window: ReactionWindowRecord,
  encounter: EncounterState,
  dice: Dice,
): Decision {
  const { state } = context;
  const { trigger } = window;
  if (trigger.kind !== 'damage') return noTrigger();
  const pay = rebukePlan(state, encounter, command.combatantId, trigger.sourceId);
  if (!pay.legal) return refused(pay);
  const source = vitalsOf(state, trigger.sourceId);
  const sourceRecord = combatantOf(encounter, trigger.sourceId);
  if (!source || !sourceRecord) return noTrigger();
  const count = HELLISH_REBUKE_DICE.count + (pay.slotLevel - 1) * HELLISH_REBUKE_DICE.perLevel;
  const fire = rollDamage(dice, count, HELLISH_REBUKE_DICE.sides, 0);
  const cover = coverOf(state, encounter, sourceRecord);
  const save = spellSave(
    dice,
    source,
    'dex',
    pay.saveDc,
    cover === 'total' ? 'none' : cover,
    'spell',
    false,
    sourceRecord.squeezed === true,
  );
  const amount = save.success ? Math.floor(fire.total / 2) : fire.total;
  const applied = applyDamage(state, dice, source, {
    sourceId: command.combatantId,
    amount,
    damageType: 'fire',
    rolls: [...fire.rolls],
    critical: false,
  });
  const events: DraftEvent[] = [
    combatPremises(state, command.combatantId),
    used(window, command, pay.slotLevel),
    cast(command.combatantId, 'hellish-rebuke', pay.slotLevel, trigger.sourceId),
    vitalsEvent({ kind: 'character', entityId: command.combatantId, sheet: pay.sheet }),
    combatantEvent(withTurn(pay.record, pay.turn)),
    save.event,
    ...applied.events,
  ];
  const ids = command.resolution?.ids ?? [];
  return accept(...finish(context, command.type, window, [command.combatantId], events, dice, ids));
}
