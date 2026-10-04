import type { AuthoringIssue, AuthoringWarning, RiskLevel, RiskReason } from '@ltw/contracts';

import {
  decideCreateEntity,
  decidePlaceEntity,
  decideUpdateEntityProfile,
} from '../kernel/decide/entities.ts';
import type { Decision, DecisionContext, ResolvedProposable } from '../kernel/decision.ts';
import type { KernelEvent, RecordedEvent } from '../kernel/events.ts';
import { foldDraftsWithEvents } from '../kernel/provisional.ts';
import type { WorldState } from '../kernel/state.ts';
import { decideSetDisclosure } from '../investigation/authoring.ts';
import { decideAddKnowledge } from '../knowledge/decide.ts';
import { highestRisk } from './consent.ts';
import { continuityWarnings, knowledgeBeforeSubject } from './continuity.ts';
import { operationPolicy, publicEntityIds } from './policy.ts';

/**
 * Assessment of a proposal (docs/adr/0018-ai-authoring.md §1, §3): each
 * operation in order, first against the enabled-operations policy, then by
 * its own World Engine decision on the state its predecessors produced, then
 * against continuity. Every issue is collected, so a preview shows them all.
 * Pure, and the same for preview and commit.
 */
export interface Assessment {
  /** Events of the operations that were decided successfully. */
  readonly drafts: readonly KernelEvent[];
  readonly issues: readonly AuthoringIssue[];
  readonly warnings: readonly AuthoringWarning[];
  readonly risk: { readonly level: RiskLevel; readonly reasons: readonly RiskReason[] };
}

export function assessAuthoring(
  context: DecisionContext,
  commands: readonly ResolvedProposable[],
): Assessment {
  const open = publicEntityIds(context.state);
  let state = context.state;
  const history: RecordedEvent[] = [...context.history];
  const drafts: KernelEvent[] = [];
  const issues: AuthoringIssue[] = [];
  const reasons: RiskReason[] = [];
  const applied = new Set<number>();

  commands.forEach((command, index) => {
    const policy = operationPolicy(state, command, open);
    reasons.push({ commandIndex: index, level: policy.level, reason: policy.reason });
    if (!policy.supported) {
      issues.push({ commandIndex: index, code: 'UNSUPPORTED_OPERATION', message: policy.reason });
      return;
    }
    const decision = decideOperation(state, command);
    if (!decision.ok) {
      issues.push({
        commandIndex: index,
        code: decision.rejection.code,
        message: decision.rejection.message,
      });
      return;
    }
    const folded = foldDraftsWithEvents({ ...context, state }, 'ApplyAuthoring', decision.events);
    if (command.type === 'AddKnowledge') {
      issues.push(...knowledgeBeforeSubject(folded.state, command, index));
    }
    if (command.type === 'CreateEntity') open.add(command.entityId);
    drafts.push(...decision.events);
    history.push(...folded.events);
    state = folded.state;
    applied.add(index);
  });

  return {
    drafts,
    issues,
    warnings: continuityWarnings({ state, history, commands, applied, open }),
    risk: { level: highestRisk(reasons.map((reason) => reason.level)), reasons },
  };
}

/** The World Engine's own decision for one enabled operation. */
function decideOperation(state: WorldState, command: ResolvedProposable): Decision {
  switch (command.type) {
    case 'CreateEntity':
      return decideCreateEntity(state, command);
    case 'PlaceEntity':
      return decidePlaceEntity(state, command);
    case 'UpdateEntityProfile':
      return decideUpdateEntityProfile(state, command);
    case 'AddKnowledge':
      return decideAddKnowledge(state, command);
    case 'SetDisclosure':
      return decideSetDisclosure(state, command);
    case 'ChangeEntityStatus':
    case 'AdvanceWorldTime':
      throw new Error(`${command.type} is never enabled, so it is never decided`);
  }
}
