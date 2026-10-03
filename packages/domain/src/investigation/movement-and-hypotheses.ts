import type { KnowledgeScope } from '@ltw/contracts';

import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import { isCombatant } from '../combat/records.ts';
import { isVisible } from '../knowledge/projection.ts';
import type { Premise } from './events.ts';
import { acting, knownPremise, notFound, premisesEvent, target } from './acting.ts';

/**
 * `EnterLocation` and `FormHypothesis` (docs/adr/0013-investigation.md §1, §4).
 * Hypotheses are created as HYPOTHESIS and nothing ever changes their type.
 * Both record what made them legal (Gate 02, G02-H02).
 */
export function decideEnterLocation(
  state: WorldState,
  command: ResolvedCommandOf<'EnterLocation'>,
): Decision {
  const actor = acting(state, command.characterId);
  if (!actor.ok) return actor;
  if (isCombatant(state, command.characterId)) {
    return reject(
      'COMBAT_ALREADY_ACTIVE',
      'A combatant stays on the battlefield until combat ends',
    );
  }
  const location = target(state, actor.value, command.locationId);
  if (!location.ok) return location;
  if (location.value.entity.kind !== 'location') {
    return reject('NOT_A_LOCATION', 'Not a location');
  }
  if (actor.value.locationId === command.locationId) return reject('NO_EFFECT', 'Already here');
  // A destroyed location may be entered: refusing would reveal the status of an absent place.
  return accept(premisesEvent(command.characterId, [location.value.premise]), {
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
  const premises: Premise[] = [];
  for (const entityId of subjects) {
    const premise = knownPremise(actor.value, entityId);
    if (premise === null) return notFound();
    premises.push(premise);
  }
  if (new Set(relations.map((r) => `${r.type}:${r.knowledgeId}`)).size !== relations.length) {
    return reject('INVALID_KNOWLEDGE', 'Relations must be unique');
  }
  for (const relation of relations) {
    const record = state.knowledge.get(relation.knowledgeId);
    if (!record || !isVisible(record, actor.value.perspective)) {
      return reject('KNOWLEDGE_NOT_FOUND', 'Not found');
    }
    // A cited PARTY record is visible only while the character is in the party.
    if (record.scope.kind === 'PARTY') premises.push({ kind: 'party' });
  }
  if (command.scope === 'PARTY') premises.push({ kind: 'party' });
  const scope: KnowledgeScope =
    command.scope === 'PARTY'
      ? { kind: 'PARTY' }
      : { kind: 'CHARACTER', characterId: command.characterId };
  return accept(premisesEvent(command.characterId, premises), {
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
