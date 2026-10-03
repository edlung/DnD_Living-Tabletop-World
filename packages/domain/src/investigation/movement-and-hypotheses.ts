import type { KnowledgeScope } from '@ltw/contracts';

import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import { isVisible } from '../knowledge/projection.ts';
import { acting, notFound, target } from './acting.ts';

/**
 * `EnterLocation` and `FormHypothesis` (docs/adr/0013-investigation.md §1, §4).
 * Hypotheses are created as HYPOTHESIS and nothing ever changes their type.
 */
export function decideEnterLocation(
  state: WorldState,
  command: ResolvedCommandOf<'EnterLocation'>,
): Decision {
  const actor = acting(state, command.characterId);
  if (!actor.ok) return actor;
  const location = target(state, actor.value, command.locationId);
  if (!location.ok) return location;
  if (location.value.kind !== 'location') return reject('NOT_A_LOCATION', 'Not a location');
  if (actor.value.locationId === command.locationId) return reject('NO_EFFECT', 'Already here');
  // A destroyed location may be entered: refusing would reveal the status of an absent place.
  return accept({
    type: 'EntityPlaced',
    payload: {
      entityId: command.characterId,
      locationId: command.locationId,
      since: state.clock,
      previousLocationId: actor.value.locationId,
    },
  });
}

export function decideFormHypothesis(
  state: WorldState,
  command: ResolvedCommandOf<'FormHypothesis'>,
): Decision {
  const actor = acting(state, command.characterId);
  if (!actor.ok) return actor;
  const [knowledgeId] = command.resolution.ids;
  if (knowledgeId === undefined) throw new Error('FormHypothesis resolved without an ID');
  if (command.scope === 'PARTY' && actor.value.scope.kind !== 'PARTY') {
    return reject('INVALID_KNOWLEDGE', 'The character is not in the party');
  }
  const subjects = command.subjects ?? [];
  const relations = command.relations ?? [];
  if (new Set(subjects).size !== subjects.length) {
    return reject('INVALID_KNOWLEDGE', 'Subjects must be unique');
  }
  // Only entities the character knows, and only records its perspective can see.
  if (subjects.some((entityId) => !actor.value.known.has(entityId))) return notFound();
  if (new Set(relations.map((r) => `${r.type}:${r.knowledgeId}`)).size !== relations.length) {
    return reject('INVALID_KNOWLEDGE', 'Relations must be unique');
  }
  for (const relation of relations) {
    const record = state.knowledge.get(relation.knowledgeId);
    if (!record || !isVisible(record, actor.value.perspective)) {
      return reject('KNOWLEDGE_NOT_FOUND', 'Not found');
    }
  }
  const scope: KnowledgeScope =
    command.scope === 'PARTY'
      ? { kind: 'PARTY' }
      : { kind: 'CHARACTER', characterId: command.characterId };
  return accept({
    type: 'KnowledgeAssigned',
    payload: {
      knowledgeId,
      scope,
      knowledgeType: 'HYPOTHESIS',
      statement: command.statement,
      subjects: [...subjects],
      attributedTo: null,
      relations: relations.map(({ type, knowledgeId: to }) => ({ type, knowledgeId: to })),
      knownSince: state.clock,
    },
  });
}
