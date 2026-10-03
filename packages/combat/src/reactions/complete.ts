import type { KernelCommandType } from '@ltw/contracts';
import {
  foldDrafts,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type ReactionWindowRecord,
} from '@ltw/domain';

import { isSliceSpell } from '../legality.ts';
import { monsterSpellEvents } from '../monster-spells.ts';
import { combatPremises } from '../refusal.ts';
import { characterSpellPlan, monsterSpellPlan } from '../spell-legality.ts';
import { castEvents } from '../spells.ts';

/**
 * Resolving a cast a reaction window let through (docs/adr/0016-reaction-engine.md
 * §1). It is decided again against the state after the window's answers
 * (for example the reactor's spent slot), with the economy it already spent
 * refunded for the check, and with the closing command's dice and IDs. The
 * pause rule keeps everything it depends on unchanged, so it is still legal;
 * if it were not, the command fails instead of recording a partial result.
 */
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
  const illegal = (reason: string) =>
    new Error(`suspended ${trigger.spellId} became illegal (${reason})`);

  if (state.entities.get(trigger.casterId)?.kind === 'character') {
    if (!isSliceSpell(trigger.spellId)) throw illegal('NOT_KNOWN');
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
    if (!plan.legal) throw illegal(plan.reason);
    return castEvents(state, trigger.casterId, plan, dice, ids);
  }
  const encounter = state.encounter;
  if (!encounter) throw illegal('NOT_IN_COMBAT');
  const plan = monsterSpellPlan(
    state,
    encounter,
    trigger.casterId,
    trigger.spellId,
    trigger.targetId ?? undefined,
    trigger.economy,
  );
  if (!plan.legal) throw illegal(plan.reason);
  return [
    combatPremises(state, trigger.casterId),
    ...monsterSpellEvents(state, trigger.casterId, plan, dice),
  ];
}
