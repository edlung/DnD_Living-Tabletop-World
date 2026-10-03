import type { KnowledgeType, Relevance } from '@ltw/contracts';

import type { ContextInputs } from './inputs.ts';

/**
 * Deterministic relevance (docs/adr/0012-context-engine.md "Relevance").
 * Reads only the acting perspective's visible records, visible memories,
 * and what it perceives; never canonical truth, never other holders'
 * knowledge. Relevance never changes legality.
 */
export const RELEVANCE_RANK: Readonly<Record<Relevance, number>> = { high: 0, medium: 1, low: 2 };

const OPEN_QUESTION_TYPES: ReadonlySet<KnowledgeType> = new Set(['UNKNOWN', 'HYPOTHESIS', 'RUMOR']);

/** Entities the perspective has an open question, hypothesis, or rumor about. */
export function openQuestionSubjects(inputs: ContextInputs): Set<string> {
  const subjects = new Set<string>();
  for (const record of inputs.records) {
    if (OPEN_QUESTION_TYPES.has(record.knowledgeType)) {
      record.subjects.forEach((entityId) => subjects.add(entityId));
    }
  }
  return subjects;
}

/** Entities that share at least one visible record with `entityId`. */
export function sharedRecordEntities(inputs: ContextInputs, entityId: string): Set<string> {
  const related = new Set<string>();
  for (const record of inputs.records) {
    const involved = [...record.subjects];
    if (record.attributedTo !== null) involved.push(record.attributedTo);
    if (involved.includes(entityId)) involved.forEach((id) => related.add(id));
  }
  related.delete(entityId);
  return related;
}

/** Visible memories that involve the entity as a participant or as their location. */
export function memoriesAbout(inputs: ContextInputs, entityId: string): number {
  return inputs.memories.filter(
    (memory) => memory.participants.includes(entityId) || memory.locationId === entityId,
  ).length;
}
