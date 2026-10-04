import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import { CLAIMABLE_TYPES, carriesClaims } from './records.ts';

/**
 * `SetClaim` (docs/adr/0014-contradictions-and-epistemic-integrity.md §1): DM
 * structure on a held, asserting record or on a clue. The subject must be
 * one the record (or clue) already names, so a claim can never introduce
 * an entity to a holder. Claims are immutable; undo is the only removal.
 * World truth may carry claims for continuity checks only (ADR 0019 §4):
 * detection never joins WORLD_TRUTH, so no player ever sees them.
 */
const invalid = (message: string) => reject('INVALID_CLAIM', message);

export function decideSetClaim(
  state: WorldState,
  command: ResolvedCommandOf<'SetClaim'>,
): Decision {
  const { target, claim } = command;
  if (target.kind === 'knowledge') {
    const record = state.knowledge.get(target.knowledgeId);
    if (!record) {
      return reject('KNOWLEDGE_NOT_FOUND', `Knowledge "${target.knowledgeId}" does not exist`);
    }
    // World truth carries claims for continuity only; detection never joins it (ADR 0019 §4).
    if (!carriesClaims(record.scope)) {
      return invalid('DM records never carry claims');
    }
    if (!CLAIMABLE_TYPES.has(record.knowledgeType)) {
      return invalid(`${record.knowledgeType} records do not assert anything`);
    }
    if (!record.subjects.includes(claim.subjectId)) {
      return invalid('The claim must be about one of the record’s subjects');
    }
    if (state.epistemics.claims.has(target.knowledgeId)) {
      return invalid('The record already has a claim');
    }
  } else {
    const clue = state.investigation.clues.get(target.clueId);
    if (!clue) return invalid(`Clue "${target.clueId}" does not exist`);
    if (claim.subjectId !== clue.entityId && !clue.subjects.includes(claim.subjectId)) {
      return invalid('The claim must be about the clue’s entity or one of its subjects');
    }
    if (state.epistemics.clueClaims.has(target.clueId)) {
      return invalid('The clue already has a claim');
    }
  }
  return accept({
    type: 'ClaimSet',
    payload: { target: { ...target }, claim: { ...claim }, source: null },
  });
}
