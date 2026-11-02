import { openReactionWindow, pendingCandidates, type WorldState } from '@ltw/domain';

import { replanSuspended } from './complete.ts';
import { counterspellPlan } from './eligibility.ts';
import { opportunityPlan } from './opportunity.ts';

/**
 * What an open reaction window needs the Rules for (docs/adr/0016-reaction-engine.md;
 * Gate 03, G03-H01): its suspended cast can still resolve, and every pending
 * candidate can still react. `checkWorldIntegrity` covers the structure;
 * this covers legality, so a window reopened over a changed world shows up.
 */
export function reactionWindowViolations(state: WorldState): string[] {
  const window = openReactionWindow(state);
  if (!window) return [];
  const encounter = state.encounter;
  if (!encounter) return [`reaction window ${window.windowId} is open outside combat`];
  const violations: string[] = [];
  const { trigger } = window;
  if (trigger.kind === 'move') {
    // A provoking move: every pending candidate can still take its opportunity attack (ADR 0046).
    for (const candidateId of pendingCandidates(window)) {
      const plan = opportunityPlan(state, encounter, candidateId, trigger.moverId);
      if (!plan.legal)
        violations.push(`pending ${candidateId} can no longer react: ${plan.reason}`);
    }
    return violations;
  }
  const replanned = replanSuspended(state, trigger);
  if ('legal' in replanned) {
    violations.push(`suspended ${trigger.spellId} is no longer legal: ${replanned.reason}`);
  }
  const { casterId, components } = trigger;
  for (const candidateId of pendingCandidates(window)) {
    const plan = counterspellPlan(state, encounter, candidateId, casterId, components);
    if (!plan.legal) violations.push(`pending ${candidateId} can no longer react: ${plan.reason}`);
  }
  return violations;
}
