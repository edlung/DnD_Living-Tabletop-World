import type {
  AuthoringIssue,
  AuthoringNote,
  AuthoringWarning,
  RiskLevel,
  RiskReason,
} from '@ltw/contracts';

import { decideSetClaim } from '../contradiction/decide.ts';
import { decideSetDisclosure } from '../investigation/authoring.ts';
import {
  decideCreateEntity,
  decidePlaceEntity,
  decideUpdateEntityProfile,
} from '../kernel/decide/entities.ts';
import type {
  Decision,
  DecisionContext,
  Rejection,
  ResolvedProposable,
} from '../kernel/decision.ts';
import type { KernelEvent, RecordedEvent } from '../kernel/events.ts';
import { foldDraftsWithEvents } from '../kernel/provisional.ts';
import type { WorldState } from '../kernel/state.ts';
import { decideAddKnowledge } from '../knowledge/decide.ts';
import { decideSetRelationship } from '../relationships/decide.ts';
import { highestRisk } from './consent.ts';
import { findingKey, withOptionIds, type IssueDraft } from './continuity/describe.ts';
import { removal } from './continuity/edits.ts';
import { continuityFindings } from './continuity/findings.ts';
import { knowledgeBeforeSubject, knownAfterDeath } from './continuity/timeline.ts';
import { rejectionOptions } from './continuity/repairs.ts';
import { operationPolicy, publicEntityIds } from './policy.ts';

/**
 * Assessment of a proposal (docs/adr/0018-ai-authoring.md §1, §3;
 * docs/adr/0019-continuity-engine.md): each operation in order, first against
 * the enabled-operations policy, then by its own World Engine decision on the
 * state its predecessors produced, then against the blocking continuity
 * checks. Every issue is collected with its explanation and options, so a
 * preview shows them all; warnings and notes follow on the provisional
 * world. Pure, and the same for preview and commit.
 */
export interface Assessment {
  /** Events of the operations that were decided successfully, after any premises. */
  readonly drafts: readonly KernelEvent[];
  readonly issues: readonly AuthoringIssue[];
  readonly warnings: readonly AuthoringWarning[];
  readonly notes: readonly AuthoringNote[];
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
  const issues: IssueDraft[] = [];
  const reasons: RiskReason[] = [];
  const applied = new Set<number>();
  // Holders whose status history decided that they could still learn (ADR 0019 §2).
  const premised = new Set<string>();

  commands.forEach((command, index) => {
    const policy = operationPolicy(state, command, open);
    reasons.push({ commandIndex: index, level: policy.level, reason: policy.reason });
    if (!policy.supported) {
      issues.push({
        key: findingKey('UNSUPPORTED_OPERATION', index),
        commandIndex: index,
        code: 'UNSUPPORTED_OPERATION',
        message: policy.reason,
        options: removal(commands, index),
      });
      return;
    }
    const decision = decideOperation(state, command);
    if (!decision.ok) {
      issues.push(rejectionIssue(state, commands, index, decision.rejection));
      return;
    }
    const folded = foldDraftsWithEvents({ ...context, state }, 'ApplyAuthoring', decision.events);
    if (command.type === 'AddKnowledge') {
      const after = [...history, ...folded.events];
      issues.push(
        ...knowledgeBeforeSubject(folded.state, commands, command, index),
        ...knownAfterDeath(folded.state, after, commands, command, index),
      );
      if (command.scope.kind === 'NPC' && context.state.entities.has(command.scope.npcId)) {
        premised.add(command.scope.npcId);
      }
    }
    if (command.type === 'CreateEntity') open.add(command.entityId);
    drafts.push(...decision.events);
    history.push(...folded.events);
    state = folded.state;
    applied.add(index);
  });

  const findings = continuityFindings({
    before: context.state,
    state,
    history,
    commands,
    applied,
    open,
  });
  const premises = [...premised].map((entityId) => ({ kind: 'status' as const, entityId }));
  return {
    drafts:
      premises.length > 0
        ? [{ type: 'AuthoringPremisesRecorded', payload: { premises } }, ...drafts]
        : drafts,
    issues: issues.map(withOptionIds),
    warnings: findings.warnings,
    notes: findings.notes,
    risk: { level: highestRisk(reasons.map((reason) => reason.level)), reasons },
  };
}

function rejectionIssue(
  state: WorldState,
  commands: readonly ResolvedProposable[],
  index: number,
  rejection: Rejection,
): IssueDraft {
  return {
    key: findingKey(rejection.code, index),
    commandIndex: index,
    code: rejection.code,
    message: rejection.message,
    options: [
      ...rejectionOptions(state, commands, index, rejection.code),
      ...removal(commands, index),
    ],
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
    case 'SetClaim':
      return decideSetClaim(state, command);
    case 'SetRelationship':
      return decideSetRelationship(state, command);
    case 'ChangeEntityStatus':
    case 'AdvanceWorldTime':
      throw new Error(`${command.type} is never enabled, so it is never decided`);
  }
}
