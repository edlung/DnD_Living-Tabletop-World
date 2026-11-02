import type { z } from 'zod';

import { RESOLVED_ID_POOL } from '../investigation/records.ts';
import type { WorldState } from '../kernel/state.ts';
import type { reactionTriggerSchema, reactionWindowSchema } from './reaction-events.ts';

/**
 * Reaction windows (docs/adr/0016-reaction-engine.md §1). Every window is
 * kept by ID for traceability; at most one is open, and while it is open
 * the encounter waits for its candidates.
 */
export type ReactionWindowRecord = z.infer<typeof reactionWindowSchema>;
export type ReactionTrigger = z.infer<typeof reactionTriggerSchema>;

/**
 * A `CastSpell` resolves one ID more than the record pool: the ID of the
 * window it may open. Detect Magic keeps using the pool from the start.
 */
export const REACTION_WINDOW_ID_INDEX = RESOLVED_ID_POOL;
export const MAX_RESOLVED_IDS = RESOLVED_ID_POOL + 1;

/** The open window, if any. */
export function openReactionWindow(state: WorldState): ReactionWindowRecord | null {
  for (const window of state.reactionWindows.values()) {
    if (window.status === 'open') return window;
  }
  return null;
}

export const pendingCandidates = (window: ReactionWindowRecord): string[] =>
  window.candidates.filter((c) => c.response === 'pending').map((c) => c.entityId);

/** Who set the window off: the caster of a spell, or the creature leaving reach (ADR 0046). */
export const triggerActor = (trigger: ReactionTrigger): string =>
  trigger.kind === 'spell' ? trigger.casterId : trigger.moverId;

/** The reactions a candidate may use: a window from before ADR 0046 lists none (Counterspell). */
export const candidateReactions = (candidate: ReactionWindowRecord['candidates'][number]) =>
  candidate.reactions ?? (['counterspell'] as const);

/** Everyone whose state the window's eligibility read: the trigger's actor, candidates, the rest. */
export const consideredCombatants = (window: ReactionWindowRecord): string[] => [
  triggerActor(window.trigger),
  ...window.candidates.map((c) => c.entityId),
  ...window.ineligible.map((c) => c.entityId),
];
