import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import type { RecordedEvent, Restore } from '../kernel/events.ts';
import { withEntry, withoutEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';
import { scopeKey } from '../knowledge/records.ts';
import { isHolderScope, pairKey, type EpistemicState } from './records.ts';

/** Fold cases for claim and contradiction events (called from kernel/evolve.ts). */
type EventOf<T extends RecordedEvent['type']> = Extract<RecordedEvent, { type: T }>;

const withEpistemics = (state: WorldState, change: Partial<EpistemicState>): WorldState => ({
  ...state,
  epistemics: { ...state.epistemics, ...change },
});

export function applyClaimSet(state: WorldState, event: EventOf<'ClaimSet'>): WorldState {
  const { target, claim } = event.payload;
  const { epistemics } = state;
  if (!state.entities.has(claim.subjectId)) {
    throw new CorruptHistoryError('claim about a missing entity');
  }
  if (target.kind === 'knowledge') {
    const record = state.knowledge.get(target.knowledgeId);
    if (!record || !isHolderScope(record.scope) || !record.subjects.includes(claim.subjectId)) {
      throw new CorruptHistoryError(`invalid claim on ${target.knowledgeId}`);
    }
    if (epistemics.claims.has(target.knowledgeId)) {
      throw new CorruptHistoryError(`second claim on ${target.knowledgeId}`);
    }
    return withEpistemics(state, {
      claims: withEntry(epistemics.claims, target.knowledgeId, { ...claim }),
    });
  }
  if (!state.investigation.clues.has(target.clueId) || epistemics.clueClaims.has(target.clueId)) {
    throw new CorruptHistoryError(`invalid claim on clue ${target.clueId}`);
  }
  return withEpistemics(state, {
    clueClaims: withEntry(epistemics.clueClaims, target.clueId, { ...claim }),
  });
}

export function applyContradictionDetected(
  state: WorldState,
  event: EventOf<'ContradictionDetected'>,
): WorldState {
  const { knowledgeId, scope, between } = event.payload;
  const record = state.knowledge.get(knowledgeId);
  if (record?.knowledgeType !== 'CONTRADICTION' || scopeKey(record.scope) !== scopeKey(scope)) {
    throw new CorruptHistoryError(`contradiction ${knowledgeId} has no matching record`);
  }
  if (!between.every((id) => state.knowledge.has(id)) || between[0] >= between[1]) {
    throw new CorruptHistoryError(`contradiction ${knowledgeId} references invalid records`);
  }
  const key = pairKey(scopeKey(scope), between[0], between[1]);
  if (state.epistemics.contradictions.has(key)) {
    throw new CorruptHistoryError(`contradiction recorded twice: ${key}`);
  }
  return withEpistemics(state, {
    contradictions: withEntry(state.epistemics.contradictions, key, knowledgeId),
  });
}

type EpistemicRestore = Extract<Restore, { fact: 'claim' | 'contradiction' }>;

export function applyEpistemicRestore(state: WorldState, restore: EpistemicRestore): WorldState {
  const { epistemics } = state;
  if (restore.fact === 'contradiction') {
    if (!epistemics.contradictions.has(restore.key)) {
      throw new CorruptHistoryError(`unknown contradiction ${restore.key}`);
    }
    return withEpistemics(state, {
      contradictions: withoutEntry(epistemics.contradictions, restore.key),
    });
  }
  const { target } = restore;
  if (target.kind === 'knowledge') {
    if (!epistemics.claims.has(target.knowledgeId)) {
      throw new CorruptHistoryError(`unknown claim on ${target.knowledgeId}`);
    }
    return withEpistemics(state, { claims: withoutEntry(epistemics.claims, target.knowledgeId) });
  }
  if (!epistemics.clueClaims.has(target.clueId)) {
    throw new CorruptHistoryError(`unknown claim on clue ${target.clueId}`);
  }
  return withEpistemics(state, { clueClaims: withoutEntry(epistemics.clueClaims, target.clueId) });
}
