import type { KernelCommandType } from '@ltw/contracts';
import {
  combatantOf,
  foldDrafts,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type ReactionWindowRecord,
  type WorldState,
} from '@ltw/domain';

import { isAlive } from '../battlefield.ts';
import { isSliceSpell, type Refusal } from '../legality.ts';
import { monsterSpellEvents } from '../monster-spells.ts';
import { continueMove } from '../movement.ts';
import { hitEvents, madeOf, missEvents } from './attack-windows.ts';
import { fallMoment, landFalls } from './fall-window.ts';
import { combatPremises } from '../refusal.ts';
import {
  characterSpellPlan,
  monsterSpellPlan,
  type CharacterSpellPlan,
  type MonsterSpellPlan,
} from '../spell-legality.ts';
import { castEvents } from '../spells.ts';
import { vitalsOf } from '../vitals.ts';

/**
 * Resolving a cast a reaction window let through (docs/adr/0016-reaction-engine.md
 * §1). It is decided again against the state after the window's answers
 * (for example the reactor's spent slot), with the economy it already spent
 * refunded for the check, and with the closing command's dice and IDs. The
 * pause rule and the reopening rule keep everything it depends on unchanged,
 * so it is still legal (`reactionWindowViolations` checks exactly that); if it
 * were not, the command fails instead of recording a partial result.
 */
export type Replanned =
  | { readonly kind: 'character'; readonly plan: CharacterSpellPlan }
  | { readonly kind: 'creature'; readonly plan: MonsterSpellPlan };

type SpellTrigger = Extract<ReactionWindowRecord['trigger'], { kind: 'spell' }>;

/** The suspended cast, planned again on `state` as if its economy were not spent yet. */
export function replanSuspended(state: WorldState, trigger: SpellTrigger): Replanned | Refusal {
  if (state.entities.get(trigger.casterId)?.kind === 'character') {
    if (!isSliceSpell(trigger.spellId)) return { legal: false, reason: 'NOT_KNOWN' };
    const plan = characterSpellPlan(
      state,
      trigger.casterId,
      {
        spellId: trigger.spellId,
        ...(trigger.using === null ? {} : { using: trigger.using }),
        ...(trigger.targetId === null ? {} : { targetId: trigger.targetId }),
        ...(trigger.point === null ? {} : { point: trigger.point }),
      },
      trigger.economy,
    );
    return plan.legal ? { kind: 'character', plan } : plan;
  }
  if (!state.encounter) return { legal: false, reason: 'NOT_IN_COMBAT' };
  const plan = monsterSpellPlan(
    state,
    state.encounter,
    trigger.casterId,
    trigger.spellId,
    trigger.targetId ?? undefined,
    trigger.economy,
  );
  return plan.legal ? { kind: 'creature', plan } : plan;
}

export function completeSuspended(
  context: DecisionContext,
  commandType: KernelCommandType,
  prior: readonly DraftEvent[],
  window: ReactionWindowRecord,
  dice: Dice,
  ids: readonly string[],
): DraftEvent[] {
  const state = foldDrafts(context, commandType, prior);
  const { trigger } = window;
  // A move out of reach goes on (docs/adr/0046-reactions-beyond-counterspell.md §2).
  if (trigger.kind === 'move') return continueMove(context, state, trigger, ids, dice);
  // A hit nobody answered lands in full; a miss stays one, which Graze may still make hurt
  // (docs/adr/0047-weapons.md §2); a rebuke's window holds nothing (§3–4).
  if (trigger.kind === 'attack') {
    if (trigger.phase === 'missed') {
      return missEvents(
        context,
        state,
        dice,
        ids,
        madeOf(trigger),
        trigger.spec,
        window.parentWindowId,
      );
    }
    if (trigger.damage === null) return [];
    return hitEvents(
      context,
      state,
      dice,
      ids,
      madeOf(trigger),
      trigger.spec,
      trigger.critical,
      trigger.damage,
      false,
      window.parentWindowId,
    );
  }
  if (trigger.kind === 'damage') {
    const falls = (trigger.falling ?? []).flatMap(({ entityId, feet }) => {
      const record = state.encounter ? combatantOf(state.encounter, entityId) : undefined;
      const vitals = vitalsOf(state, entityId);
      return record && vitals && isAlive(state, entityId) ? [{ record, vitals, feet }] : [];
    });
    return fallMoment(context, state, dice, ids, falls, window.parentWindowId);
  }
  // A fall: those Feather Fall slowed land unharmed, the rest hard (ADR 0049 §8). Its answers are
  // in the state the closing command left.
  if (trigger.kind === 'fall') {
    return landFalls(state, dice, state.reactionWindows.get(window.windowId) ?? window);
  }
  const casterId = trigger.casterId;
  const replanned = replanSuspended(state, trigger);
  if ('legal' in replanned) {
    throw new Error(`suspended ${trigger.spellId} became illegal (${replanned.reason})`);
  }
  return replanned.kind === 'character'
    ? castEvents(state, casterId, replanned.plan, dice, ids)
    : [
        combatPremises(state, casterId),
        ...monsterSpellEvents(state, casterId, replanned.plan, dice),
      ];
}
