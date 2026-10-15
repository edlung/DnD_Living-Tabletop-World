import type { EntityKind } from '@ltw/contracts';

import { findEntity } from '../kernel/decide/lookups.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import { isAtOrAfter } from '../kernel/world-time.ts';
import { WORLD_TRUTH_TYPES } from './records.ts';

/**
 * Knowledge authoring decisions (docs/adr/0008-knowledge-boundary.md).
 * Records are immutable once assigned; types never change here.
 */
const SPEAKER_KINDS: ReadonlySet<EntityKind> = new Set(['npc', 'character', 'creature', 'faction']);

export function decideAddKnowledge(
  state: WorldState,
  command: ResolvedCommandOf<'AddKnowledge'>,
): Decision {
  const { knowledgeId, scope, knowledgeType, knownSince } = command;
  const subjects = command.subjects ?? [];
  const relations = command.relations ?? [];
  const attributedTo = command.attributedTo ?? null;

  if (state.usedIds.has(knowledgeId)) {
    return reject('ID_ALREADY_USED', `ID "${knowledgeId}" was already used`, { knowledgeId });
  }
  if (scope.kind === 'WORLD_TRUTH' && !WORLD_TRUTH_TYPES.has(knowledgeType)) {
    return reject('INVALID_KNOWLEDGE', 'WORLD_TRUTH records must be FACT or SECRET');
  }

  let holderExistsSince: number | null = null;
  if (scope.kind === 'CHARACTER' || scope.kind === 'NPC') {
    const holderId = scope.kind === 'CHARACTER' ? scope.characterId : scope.npcId;
    const holder = findEntity(state, holderId);
    if (!holder.ok) return holder;
    const expected = scope.kind === 'CHARACTER' ? 'character' : 'npc';
    if (holder.value.kind !== expected) {
      return reject('INVALID_KNOWLEDGE', `A ${scope.kind} scope must be held by a ${expected}`);
    }
    holderExistsSince = holder.value.existsSince;
  }

  if (new Set(subjects).size !== subjects.length) {
    return reject('INVALID_KNOWLEDGE', 'Subjects must be unique');
  }
  for (const subjectId of subjects) {
    const subject = findEntity(state, subjectId);
    if (!subject.ok) return subject;
  }

  if (knowledgeType === 'TESTIMONY' && attributedTo === null) {
    return reject('INVALID_KNOWLEDGE', 'TESTIMONY must be attributed to its speaker');
  }
  if (attributedTo !== null) {
    if (knowledgeType !== 'TESTIMONY' && knowledgeType !== 'RUMOR') {
      return reject('INVALID_KNOWLEDGE', 'Only TESTIMONY and RUMOR carry an attribution');
    }
    const speaker = findEntity(state, attributedTo);
    if (!speaker.ok) return speaker;
    if (!SPEAKER_KINDS.has(speaker.value.kind)) {
      return reject('INVALID_KNOWLEDGE', `Entities of kind "${speaker.value.kind}" cannot speak`);
    }
  }

  const relationKeys = new Set(relations.map((r) => `${r.type}:${r.knowledgeId}`));
  if (relationKeys.size !== relations.length) {
    return reject('INVALID_KNOWLEDGE', 'Relations must be unique');
  }
  const missing = relations.find((relation) => !state.knowledge.has(relation.knowledgeId));
  if (missing) {
    return reject('KNOWLEDGE_NOT_FOUND', `Knowledge "${missing.knowledgeId}" does not exist`);
  }

  if (knownSince !== null && knownSince > state.clock) {
    return reject('TEMPORAL_CONFLICT', 'Knowledge cannot be learned after the world clock');
  }
  if (!isAtOrAfter(knownSince, holderExistsSince)) {
    return reject('TEMPORAL_CONFLICT', 'A holder cannot learn something before it existed');
  }

  return accept({
    type: 'KnowledgeAssigned',
    payload: {
      knowledgeId,
      scope,
      knowledgeType,
      statement: command.statement,
      subjects: [...subjects],
      attributedTo,
      relations: relations.map(({ type, knowledgeId: target }) => ({ type, knowledgeId: target })),
      knownSince,
    },
  });
}

export function decideAssignCharacter(
  state: WorldState,
  command: ResolvedCommandOf<'AssignCharacter'>,
): Decision {
  const character = findEntity(state, command.characterId);
  if (!character.ok) return character;
  if (character.value.kind !== 'character') {
    return reject('INVALID_ASSIGNMENT', 'Only entities of kind "character" can be assigned');
  }
  if (command.playerActorId === state.campaign?.dmActorId) {
    return reject('INVALID_ASSIGNMENT', 'The DM cannot also be a player in the same campaign');
  }
  if (state.roster.has(command.characterId)) {
    return reject('ALREADY_ASSIGNED', 'The character is already assigned');
  }
  if ([...state.roster.values()].includes(command.playerActorId)) {
    return reject('ALREADY_ASSIGNED', 'The player already controls a character');
  }
  return accept({
    type: 'CharacterAssigned',
    payload: { characterId: command.characterId, playerActorId: command.playerActorId },
  });
}

/**
 * The DM frees a character from its player from now on (docs/adr/0036-production-sign-in.md §4).
 * The event names the player, so the release can be undone; commands the player issued before
 * stay history, and the character can be assigned again.
 */
export function decideReleaseCharacter(
  state: WorldState,
  command: ResolvedCommandOf<'ReleaseCharacter'>,
): Decision {
  const character = findEntity(state, command.characterId);
  if (!character.ok) return character;
  if (character.value.kind !== 'character') {
    return reject('INVALID_ASSIGNMENT', 'Only entities of kind "character" have a player');
  }
  const playerActorId = state.roster.get(command.characterId);
  if (playerActorId === undefined) {
    return reject('NO_EFFECT', 'The character has no player');
  }
  return accept({
    type: 'CharacterReleased',
    payload: { characterId: command.characterId, playerActorId },
  });
}
