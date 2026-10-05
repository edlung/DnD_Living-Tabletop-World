import type { KernelEvent } from '../kernel/events.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import { investigationText, languageOf } from '../language/index.ts';
import { scopeKey as keyOf } from '../knowledge/records.ts';
import {
  acting,
  incapacitated,
  isIncapacitated,
  memoryEvent,
  notPresent,
  premisesEvent,
  target,
} from './acting.ts';
import type { Premise } from './events.ts';
import { shownKey } from './records.ts';

/**
 * `ShowEvidence` (docs/adr/0020-npc-intelligence.md §1). A character shows a
 * present, living NPC an EVIDENCE record the character holds, in the party's
 * scope or its own. The record's subjects count as shown to that NPC by the
 * character's disclosure scope, which may unlock guarded records (§2). A
 * record the character does not hold is "not found", like a nonexistent one.
 */
export function decideShowEvidence(
  state: WorldState,
  command: ResolvedCommandOf<'ShowEvidence'>,
): Decision {
  const { characterId, npcId, knowledgeId, resolution } = command;
  const actor = acting(state, characterId);
  if (!actor.ok) return actor;
  if (isIncapacitated(actor.value)) return incapacitated();
  const found = target(state, actor.value, npcId);
  if (!found.ok) return found;
  const record = state.knowledge.get(knowledgeId);
  const own = keyOf({ kind: 'CHARACTER', characterId });
  const held =
    record !== undefined &&
    record.knowledgeType === 'EVIDENCE' &&
    [actor.value.scopeKey, own].includes(keyOf(record.scope));
  if (!held) return reject('KNOWLEDGE_NOT_FOUND', 'Not found');
  if (!actor.value.perceived.has(npcId)) return notPresent();
  const npc = found.value.entity;
  if (npc.status !== 'active') return reject('TARGET_DEAD', 'Cannot answer');
  if (npc.kind !== 'npc') return reject('NO_EFFECT', 'Nothing to show');

  const { scopeKey } = actor.value;
  const seen = (subjectId: string) =>
    state.investigation.shown.has(shownKey(scopeKey, npcId, subjectId));
  // Subjects already shown are a premise of what this changes: nothing for them (Gate 03).
  const already = record.subjects
    .filter(seen)
    .map((subjectId): Premise => ({ kind: 'shown', scope: scopeKey, npcId, subjectId }));
  const memoryId = resolution.ids[0];
  if (memoryId === undefined) throw new Error('ShowEvidence resolved without an ID');
  const names = record.subjects.map((id) => state.entities.get(id)?.name ?? id).join(', ');

  const events: KernelEvent[] = [
    premisesEvent(characterId, [
      { kind: 'sheet' },
      found.value.premise,
      { kind: 'knowledge', knowledgeId, viaParty: record.scope.kind === 'PARTY' },
      ...already,
      ...(actor.value.scope.kind === 'PARTY' ? [{ kind: 'party' } as const] : []),
    ]),
    {
      type: 'EvidenceShown',
      payload: {
        characterId,
        npcId,
        scope: scopeKey,
        knowledgeId,
        subjects: record.subjects.filter((subjectId) => !seen(subjectId)),
      },
    },
    memoryEvent(state, actor.value, {
      memoryId,
      memoryKind: 'CONVERSATION',
      summary: investigationText(languageOf(state)).showed(
        actor.value.character.name,
        npc.name,
        names,
      ),
      participants: [characterId, npcId],
      relatedKnowledge: [knowledgeId],
      named: [characterId, npcId, ...record.subjects],
    }),
  ];
  return accept(...events);
}
