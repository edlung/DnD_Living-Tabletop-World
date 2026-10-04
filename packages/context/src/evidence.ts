import type { Relevance } from '@ltw/contracts';
import { scopeKey, shownKey } from '@ltw/domain';

import type { ContextInputs } from './inputs.ts';
import { RELEVANCE_RANK } from './relevance.ts';

/**
 * "Show evidence" (docs/adr/0020-npc-intelligence.md §1): the EVIDENCE
 * records the acting character holds, in its party's scope or its own, as
 * `ShowEvidence` accepts them. Read only from the perspective's visible
 * records and its own scope's showings, never from what the NPC knows.
 * Evidence with a subject not yet shown to this NPC ranks medium.
 */
export const MAX_EVIDENCE = 5;

export interface Showable {
  readonly knowledgeId: string;
  readonly relevance: Relevance;
}

export function showableEvidence(
  inputs: ContextInputs,
  npcId: string,
  reachable: boolean,
): Showable[] {
  const own = new Set([
    inputs.scopeKey,
    scopeKey({ kind: 'CHARACTER', characterId: inputs.actor.entityId }),
  ]);
  return inputs.records
    .filter((record) => record.knowledgeType === 'EVIDENCE' && own.has(scopeKey(record.scope)))
    .map((record): Showable => {
      const fresh = record.subjects.some(
        (subjectId) => !inputs.shown.has(shownKey(inputs.scopeKey, npcId, subjectId)),
      );
      return { knowledgeId: record.knowledgeId, relevance: reachable && fresh ? 'medium' : 'low' };
    })
    .sort((a, b) => RELEVANCE_RANK[a.relevance] - RELEVANCE_RANK[b.relevance])
    .slice(0, MAX_EVIDENCE);
}

/** Subjects the acting character's scope has shown this NPC. */
export function shownSubjects(inputs: ContextInputs, npcId: string): Set<string> {
  return new Set(
    [...inputs.known].filter((entityId) =>
      inputs.shown.has(shownKey(inputs.scopeKey, npcId, entityId)),
    ),
  );
}
