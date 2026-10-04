import type {
  AuthoringIssue,
  AuthoringPreview,
  AuthoringSource,
  ConfirmableRiskLevel,
} from '@ltw/contracts';

import type { Actor } from '../kernel/actor.ts';
import { authorize } from '../kernel/authorization.ts';
import { decide } from '../kernel/decide/decide.ts';
import type { ResolvedCommandOf, ResolvedProposable } from '../kernel/decision.ts';
import type { RecordedEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';
import { assessAuthoring } from './assess.ts';

/**
 * The DM's preview of a proposal revision (docs/adr/0018-ai-authoring.md
 * §5): the same authorization and decision a commit would get now, with
 * every issue, warning, and risk reason, the confirmation a commit needs,
 * and the events it would record. Grants nothing: the commit is decided
 * again against the state at that time.
 */
export interface PreviewInput {
  readonly campaignId: string;
  readonly proposalId: string;
  readonly revision: number;
  readonly summary: string;
  readonly source: AuthoringSource;
  readonly commands: readonly ResolvedProposable[];
}

export function previewAuthoring(
  snapshot: { readonly state: WorldState; readonly history: readonly RecordedEvent[] },
  actor: Actor,
  input: PreviewInput,
): AuthoringPreview {
  const { state, history } = snapshot;
  const command: ResolvedCommandOf<'ApplyAuthoring'> = {
    type: 'ApplyAuthoring',
    proposalId: input.proposalId,
    revision: input.revision,
    summary: input.summary,
    source: input.source,
    commands: [...input.commands],
    // Consent is checked by the World Engine at commit, never by the decision.
    confirmation: { riskLevel: 'L3', acknowledgedWarnings: [] },
  };
  const context = {
    state,
    history,
    campaignId: input.campaignId,
    commandId: `preview.${input.proposalId}`,
    actor,
  };
  const assessment = assessAuthoring({ ...context, authority: 'dm' }, input.commands);
  const base = {
    stateVersion: state.version,
    warnings: assessment.warnings,
    risk: assessment.risk,
  };
  const blocked = (issues: readonly AuthoringIssue[]): AuthoringPreview => ({
    ...base,
    committable: false,
    issues,
    confirmation: null,
    changes: [],
  });

  const authorization = authorize(state, actor, command);
  if (!authorization.ok) {
    const { code, message } = authorization.rejection;
    return blocked([{ commandIndex: null, code, message }]);
  }
  const decision = decide({ ...context, authority: authorization.authority }, command);
  if (!decision.ok) {
    const { code, message } = decision.rejection;
    return blocked(
      assessment.issues.length > 0 ? assessment.issues : [{ commandIndex: null, code, message }],
    );
  }
  if (!decision.requires || decision.requires.riskLevel === 'L4') {
    throw new Error('a legal proposal always states a confirmable consent requirement');
  }
  return {
    ...base,
    committable: true,
    issues: [],
    confirmation: {
      riskLevel: decision.requires.riskLevel satisfies ConfirmableRiskLevel,
      acknowledgedWarnings: [...decision.requires.warnings],
    },
    changes: decision.events.map(({ type, payload }) => ({ type, payload })),
  };
}
