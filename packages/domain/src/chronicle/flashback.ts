import type { FlashbackResponse } from '@ltw/contracts';

import type { RecordedEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import { entityRef } from '../knowledge/projection.ts';
import { getMemory } from '../memory/retrieval.ts';
import { dayPhaseAt } from '../visual/timeline.ts';
import { entityPresentationAt } from '../visual/views.ts';
import { sourceIndex, sourcesOf } from './views.ts';

/**
 * The minimal flashback (RAVENFORD_SPEC.md, Chronicle; docs/adr/0024-
 * chronicle.md §7; owner decision of 2026-10-04): a memory the perspective
 * may recall, opened as the place looked to it then (ADR 0023), the
 * participants, the world time, and a fragment of what was said. The
 * fragment quotes a related record the perspective may see, with its
 * epistemic type, preferring testimony, then rumor; otherwise the memory's
 * own summary. Null when the memory is not the perspective's to recall.
 */
const QUOTED = ['TESTIMONY', 'RUMOR'] as const;

export function flashbackFor(
  snapshot: { readonly state: WorldState; readonly history: readonly RecordedEvent[] },
  perspective: ResolvedPerspective,
  memoryId: string,
): FlashbackResponse | null {
  const { state, history } = snapshot;
  const memory = getMemory(state, perspective, memoryId);
  if (!memory) return null;
  const at = memory.occurredAt;
  const location = memory.location;
  const scene =
    location === null
      ? null
      : (entityPresentationAt(snapshot, perspective, location.entityId, at)?.presentation ?? null);
  // The memory view already holds only the related records the perspective may see.
  const visible = memory.relatedKnowledge.flatMap((id) => state.knowledge.get(id) ?? []);
  const quoted = QUOTED.flatMap((type) => visible.filter((r) => r.knowledgeType === type))[0];
  return {
    perspective: perspective.label,
    memoryId: memory.memoryId,
    worldTime: at,
    phase: dayPhaseAt(at),
    scene,
    participants: memory.participants.map((entity) => ({
      entity,
      presentation:
        entityPresentationAt(snapshot, perspective, entity.entityId, at)?.presentation ?? null,
    })),
    dialogue: quoted
      ? {
          text: quoted.statement,
          knowledgeType: quoted.knowledgeType,
          speaker:
            quoted.attributedTo !== null && state.entities.has(quoted.attributedTo)
              ? entityRef(state, quoted.attributedTo)
              : null,
        }
      : { text: memory.summary, knowledgeType: null, speaker: null },
    sources: sourcesOf(sourceIndex(state, history), perspective.scopes === 'ALL', {
      memoryId: memory.memoryId,
      knowledgeIds: quoted ? [quoted.knowledgeId] : [],
    }),
  };
}
