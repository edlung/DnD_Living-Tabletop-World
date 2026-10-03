import type { SpellComponent } from '@ltw/contracts';
import {
  REACTION_WINDOW_ID_INDEX,
  combatantOf,
  type DecisionContext,
  type DraftEvent,
  type ReactionTrigger,
  type ReactionWindowRecord,
} from '@ltw/domain';

import { combatantEvent } from '../battlefield.ts';
import { counterspellCandidates } from './eligibility.ts';

/**
 * Opening a reaction window (docs/adr/0016-reaction-engine.md §1). A legal
 * cast with eligible candidates is suspended: the caster's action (or Bonus
 * Action) is spent and the window records everything needed to resolve the
 * spell later. Nothing else happens yet: no slot, no effect.
 */
export type PendingCast = Omit<ReactionTrigger, 'kind' | 'components'> & {
  readonly components: readonly SpellComponent[];
};

export function suspendCast(
  context: DecisionContext,
  trigger: PendingCast,
  ids: readonly string[],
): DraftEvent[] | null {
  const { state } = context;
  const encounter = state.encounter;
  if (!encounter) return null;
  const caster = combatantOf(encounter, trigger.casterId);
  if (!caster) return null;
  const { candidates, ineligible } = counterspellCandidates(
    state,
    encounter,
    trigger.casterId,
    trigger.components,
  );
  if (candidates.length === 0) return null;
  const windowId = ids[REACTION_WINDOW_ID_INDEX];
  if (windowId === undefined) throw new Error('CastSpell resolved without a reaction window ID');

  const window: ReactionWindowRecord = {
    windowId,
    encounterId: encounter.encounterId,
    round: encounter.round,
    status: 'open',
    trigger: { kind: 'spell', ...trigger, components: [...trigger.components] },
    candidates: candidates.map((entityId) => ({ entityId, response: 'pending' })),
    ineligible: ineligible.map((entry) => ({ ...entry })),
    openedBy: context.commandId,
    closedBy: null,
  };
  const spent = {
    ...caster,
    turn: {
      ...caster.turn,
      actionUsed: caster.turn.actionUsed || trigger.economy === 'action',
      bonusActionUsed: caster.turn.bonusActionUsed || trigger.economy === 'bonus',
    },
  };
  return [combatantEvent(spent), { type: 'ReactionWindowOpened', payload: { window } }];
}
