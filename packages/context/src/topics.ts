import type { ContextEntityRef, Relevance } from '@ltw/contracts';

import type { ContextInputs } from './inputs.ts';
import { RELEVANCE_RANK, openQuestionSubjects, sharedRecordEntities } from './relevance.ts';
import { entityRefFor } from './views.ts';

/**
 * "Ask about <topic>" (docs/adr/0012-context-engine.md). Topics come only
 * from entities the acting perspective knows; nothing about what the target
 * knows is consulted, so a topic can never reveal another holder's secret.
 * Order: relevance, then perceived before not perceived, then name, then ID.
 */
export const MAX_TOPICS = 5;

export interface Topic {
  readonly ref: ContextEntityRef;
  readonly relevance: Relevance;
}

export function askTopics(inputs: ContextInputs, targetId: string): Topic[] {
  const open = openQuestionSubjects(inputs);
  const shared = sharedRecordEntities(inputs, targetId);
  const candidates = [...inputs.known].filter(
    (entityId) => entityId !== targetId && entityId !== inputs.actor.entityId,
  );
  return candidates
    .map((entityId) => {
      const relevance: Relevance = open.has(entityId)
        ? 'high'
        : shared.has(entityId)
          ? 'medium'
          : 'low';
      return { ref: entityRefFor(inputs, entityId), relevance };
    })
    .sort(
      (a, b) =>
        RELEVANCE_RANK[a.relevance] - RELEVANCE_RANK[b.relevance] ||
        Number(inputs.perceived.has(b.ref.entityId)) -
          Number(inputs.perceived.has(a.ref.entityId)) ||
        (a.ref.name ?? '').localeCompare(b.ref.name ?? '') ||
        a.ref.entityId.localeCompare(b.ref.entityId),
    )
    .slice(0, MAX_TOPICS);
}
