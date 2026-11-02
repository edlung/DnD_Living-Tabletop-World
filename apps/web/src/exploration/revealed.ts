import type { PlayerOutcome } from '@ltw/contracts';

/** The knowledge records an accepted action revealed to the viewer, from its outcome. */
export function revealedIds(outcome: PlayerOutcome | undefined): readonly string[] {
  switch (outcome?.kind) {
    case 'AskAbout':
      return outcome.shared;
    case 'ExamineEntity':
    case 'CastSpell':
      return outcome.discovered;
    case 'InsightCheck':
      return outcome.inferred;
    case 'FormHypothesis':
      return [outcome.knowledgeId];
    default:
      return [];
  }
}
