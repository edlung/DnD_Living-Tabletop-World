import type { KernelEvent } from '../kernel/events.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import {
  acting,
  incapacitated,
  isIncapacitated,
  memoryEvent,
  notFound,
  notPresent,
  target,
} from './acting.ts';
import { MAX_SHARED_PER_ASK, scopedKey } from './records.ts';

/**
 * `AskAbout` (docs/adr/0013-investigation.md §3). An NPC shares only WILLING
 * records of its own scope that mention the topic and were not yet shared
 * with the asker's scope. Nothing to share is `NO_EFFECT`, whether the NPC
 * knows nothing, guards everything, or has already told everything.
 */
export function decideAskAbout(
  state: WorldState,
  command: ResolvedCommandOf<'AskAbout'>,
): Decision {
  const { characterId, npcId, topicId, resolution } = command;
  const actor = acting(state, characterId);
  if (!actor.ok) return actor;
  if (isIncapacitated(actor.value)) return incapacitated();
  const found = target(state, actor.value, npcId);
  if (!found.ok) return found;
  if (!actor.value.known.has(topicId) || !state.entities.has(topicId)) return notFound();
  if (!actor.value.perceived.has(npcId)) return notPresent();
  const npc = found.value;
  if (npc.status !== 'active') return reject('TARGET_DEAD', 'Cannot answer');
  const nothing = () => reject('NO_EFFECT', 'Nothing new to share');
  if (npc.kind !== 'npc' || npcId === characterId) return nothing();

  const { scopeKey, scope } = actor.value;
  const willing = [...state.knowledge.values()]
    .filter(
      (record) =>
        record.scope.kind === 'NPC' &&
        record.scope.npcId === npcId &&
        state.investigation.disclosures.get(record.knowledgeId) === 'WILLING' &&
        (record.subjects.includes(topicId) || record.attributedTo === topicId) &&
        !state.investigation.shared.has(scopedKey(scopeKey, record.knowledgeId)),
    )
    .slice(0, MAX_SHARED_PER_ASK);
  if (willing.length === 0) return nothing();

  const events: KernelEvent[] = [];
  const sharedIds: string[] = [];
  willing.forEach((source, index) => {
    const knowledgeId = resolution.ids[index];
    if (knowledgeId === undefined) throw new Error('AskAbout ran out of resolved IDs');
    sharedIds.push(knowledgeId);
    events.push(
      {
        type: 'KnowledgeAssigned',
        payload: {
          knowledgeId,
          scope,
          knowledgeType: source.knowledgeType === 'RUMOR' ? 'RUMOR' : 'TESTIMONY',
          statement: source.statement,
          subjects: [...source.subjects],
          attributedTo: npcId,
          relations: [],
          knownSince: state.clock,
        },
      },
      {
        type: 'InformationShared',
        payload: {
          npcId,
          characterId,
          scope: scopeKey,
          sourceKnowledgeId: source.knowledgeId,
          knowledgeId,
        },
      },
    );
  });
  const memoryId = resolution.ids[willing.length];
  const topic = state.entities.get(topicId);
  if (memoryId === undefined || !topic) throw new Error('AskAbout ran out of resolved IDs');
  events.push(
    memoryEvent(state, actor.value, {
      memoryId,
      memoryKind: 'CONVERSATION',
      summary: `${npc.name} told ${actor.value.character.name} about ${topic.name}.`,
      participants: [characterId, npcId],
      relatedKnowledge: sharedIds,
    }),
  );
  return accept(...events);
}
