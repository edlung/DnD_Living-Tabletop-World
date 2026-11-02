import { openReactionWindow, pendingCandidates, type WorldState } from '@ltw/domain';

import { replanSuspended } from './complete.ts';
import { counterspellPlan } from './eligibility.ts';
import { opportunityPlan } from './opportunity.ts';
import { dodgePlan, mayReroll, rebukePlan, shieldPlan } from './attack-windows.ts';

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
  const pending = pendingCandidates(window);
  const report = (id: string, plan: { legal: boolean; reason?: string }) => {
    if (!plan.legal) violations.push(`pending ${id} can no longer react: ${plan.reason ?? ''}`);
  };
  switch (trigger.kind) {
    case 'move':
      // A provoking move: every pending candidate can still take its opportunity attack (ADR 0046).
      for (const id of pending) report(id, opportunityPlan(state, encounter, id, trigger.moverId));
      return violations;
    case 'attack':
      for (const id of pending) {
        if (trigger.phase === 'missed') {
          report(
            id,
            mayReroll(state, id) ? { legal: true } : { legal: false, reason: 'NO_INSPIRATION' },
          );
          continue;
        }
        const roll = {
          natural: trigger.natural,
          total: trigger.total,
          armorClass: trigger.spec.armorClass,
        };
        const shield = shieldPlan(state, encounter, id, roll);
        report(id, shield.legal ? shield : dodgePlan(state, encounter, id, trigger.attackerId));
      }
      return violations;
    case 'damage':
      for (const id of pending) report(id, rebukePlan(state, encounter, id, trigger.sourceId));
      return violations;
    case 'spell': {
      const replanned = replanSuspended(state, trigger);
      if ('legal' in replanned) {
        violations.push(`suspended ${trigger.spellId} is no longer legal: ${replanned.reason}`);
      }
      for (const id of pending) {
        report(id, counterspellPlan(state, encounter, id, trigger.casterId, trigger.components));
      }
      return violations;
    }
  }
}
