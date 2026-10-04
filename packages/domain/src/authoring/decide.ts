import {
  reject,
  type Decision,
  type DecisionContext,
  type ResolvedCommandOf,
} from '../kernel/decision.ts';
import { assessAuthoring } from './assess.ts';

/**
 * `ApplyAuthoring` (docs/adr/0018-ai-authoring.md): one confirmed proposal
 * revision applied as one command, or nothing at all (invariant 17). Any
 * blocking issue rejects the whole proposal with every issue listed. When
 * it is legal, the decision states the consent it needs; the World Engine
 * checks the command's confirmation against it before appending (§4).
 */
export function decideApplyAuthoring(
  context: DecisionContext,
  command: ResolvedCommandOf<'ApplyAuthoring'>,
): Decision {
  const { drafts, issues, warnings, notes, risk } = assessAuthoring(context, command.commands);
  if (issues.length > 0) {
    const unsupported = issues.some((issue) => issue.code === 'UNSUPPORTED_OPERATION');
    return reject(
      unsupported ? 'AUTHORING_UNSUPPORTED' : 'AUTHORING_INVALID',
      unsupported
        ? 'The proposal holds operations authoring may not apply'
        : 'The proposal cannot be applied to the world as it is now',
      { issues, warnings, notes, risk },
    );
  }
  return {
    ok: true,
    events: drafts,
    requires: { riskLevel: risk.level, warnings: warnings.map((warning) => warning.key) },
  };
}
