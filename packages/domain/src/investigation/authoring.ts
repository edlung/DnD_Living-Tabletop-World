import { CHECK_METHODS, type EntityKind } from '@ltw/contracts';

import { findEntity } from '../kernel/decide/lookups.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import { MAX_CLUES_PER_METHOD, NEVER_SHAREABLE } from './records.ts';

/**
 * DM authoring of investigation data (docs/adr/0013-investigation.md §2–3):
 * clues on examinable entities, and NPC disclosure policy.
 */
const INSPECTABLE: ReadonlySet<EntityKind> = new Set([
  'character',
  'npc',
  'creature',
  'item',
  'feature',
  'location',
]);
/** Skill checks apply to objects, matching the Context Engine catalog (ADR 0012). */
const CHECKABLE: ReadonlySet<EntityKind> = new Set(['item', 'feature']);

export function decideAddClue(state: WorldState, command: ResolvedCommandOf<'AddClue'>): Decision {
  const { clueId, entityId, method } = command;
  const subjects = command.subjects ?? [];
  if (state.usedIds.has(clueId)) {
    return reject('ID_ALREADY_USED', `ID "${clueId}" was already used`, { clueId });
  }
  const entity = findEntity(state, entityId);
  if (!entity.ok) return entity;
  // Skill-check clues need a DC; `inspect` and `magic` (Detect Magic, ADR 0015) never have one.
  const check = (CHECK_METHODS as ReadonlySet<string>).has(method);
  if (!(check ? CHECKABLE : INSPECTABLE).has(entity.value.kind)) {
    return reject('INVALID_CLUE', `A ${method} clue cannot be placed on a ${entity.value.kind}`);
  }
  if (check !== (command.dc !== undefined)) {
    return reject('INVALID_CLUE', check ? 'A check clue needs a DC' : 'An inspect clue has no DC');
  }
  if (new Set(subjects).size !== subjects.length) {
    return reject('INVALID_CLUE', 'Subjects must be unique');
  }
  for (const subjectId of subjects) {
    const subject = findEntity(state, subjectId);
    if (!subject.ok) return subject;
  }
  const existing = [...state.investigation.clues.values()].filter(
    (clue) => clue.entityId === entityId && clue.method === method,
  );
  if (existing.length >= MAX_CLUES_PER_METHOD) {
    return reject('INVALID_CLUE', `At most ${MAX_CLUES_PER_METHOD} ${method} clues per entity`);
  }
  return accept({
    type: 'ClueAdded',
    payload: {
      clueId,
      entityId,
      method,
      dc: command.dc ?? null,
      statement: command.statement,
      subjects: [...subjects],
    },
  });
}

export function decideSetDisclosure(
  state: WorldState,
  command: ResolvedCommandOf<'SetDisclosure'>,
): Decision {
  const record = state.knowledge.get(command.knowledgeId);
  if (!record) {
    return reject('KNOWLEDGE_NOT_FOUND', `Knowledge "${command.knowledgeId}" does not exist`);
  }
  if (record.scope.kind !== 'NPC') {
    return reject('INVALID_DISCLOSURE', 'Only records held by an NPC have a disclosure policy');
  }
  if (command.disclosure === 'WILLING' && NEVER_SHAREABLE.has(record.knowledgeType)) {
    return reject('INVALID_DISCLOSURE', `${record.knowledgeType} records are never shared`);
  }
  const current = state.investigation.disclosures.get(command.knowledgeId) ?? 'GUARDED';
  if (current === command.disclosure) return reject('NO_EFFECT', `Already ${current}`);
  return accept({
    type: 'DisclosureSet',
    payload: { knowledgeId: command.knowledgeId, disclosure: command.disclosure },
  });
}
