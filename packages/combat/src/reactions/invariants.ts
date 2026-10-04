import { openReactionWindow, pendingCandidates, type WorldState } from '@ltw/domain';

import { replanSuspended } from './complete.ts';
import { counterspellPlan } from './eligibility.ts';

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
  const replanned = replanSuspended(state, window);
  if ('legal' in replanned) {
    violations.push(`suspended ${window.trigger.spellId} is no longer legal: ${replanned.reason}`);
  }
  const { casterId, components } = window.trigger;
  for (const candidateId of pendingCandidates(window)) {
    const plan = counterspellPlan(state, encounter, candidateId, casterId, components);
    if (!plan.legal) violations.push(`pending ${candidateId} can no longer react: ${plan.reason}`);
  }
  return violations;
}
