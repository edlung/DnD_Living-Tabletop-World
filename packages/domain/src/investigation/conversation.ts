import type { KernelEvent } from '../kernel/events.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import { investigationText, languageOf } from '../language/index.ts';
import {
  acting,
  incapacitated,
  isIncapacitated,
  knownPremise,
  memoryEvent,
  notFound,
  notPresent,
  premisesEvent,
  target,
} from './acting.ts';
import { npcDisclosure } from './disclosure.ts';
import { MAX_SHARED_PER_ASK } from './records.ts';

/**
 * `AskAbout` (docs/adr/0013-investigation.md §3, docs/adr/0020-npc-intelligence.md
 * §2). An NPC shares the records of its own scope about the topic that it
 * would tell the asker's scope now (`npcDisclosure`): WILLING ones, and
 * guarded ones that evidence shown to it or its trust unlocks. Nothing to
 * share is `NO_EFFECT`, whether the NPC knows nothing, guards everything, or
 * has already told everything. The records it considered and did not share
 * are premises too, so undo keeps the answer exact.
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
  const topicPremise = knownPremise(actor.value, topicId);
  if (topicPremise === null || !state.entities.has(topicId)) return notFound();
  if (!actor.value.perceived.has(npcId)) return notPresent();
  const npc = found.value.entity;
  if (npc.status !== 'active') return reject('TARGET_DEAD', 'Cannot answer');
  const nothing = () => reject('NO_EFFECT', 'Nothing new to share');
  if (npc.kind !== 'npc' || npcId === characterId) return nothing();

  const { scopeKey, scope } = actor.value;
  const disclosure = npcDisclosure(state, npcId, scopeKey, topicId);
  const willing = disclosure.shareable.slice(0, MAX_SHARED_PER_ASK);
  if (willing.length === 0) return nothing();

  // Legal because: the character could speak (sheet), sees the NPC, knows the
  // topic, and (for the party scope) belongs to the party (Gate 02, G02-H02).
  const events: KernelEvent[] = [
    premisesEvent(characterId, [
      { kind: 'sheet' },
      found.value.premise,
      topicPremise,
      ...disclosure.premises,
      ...(scope.kind === 'PARTY' ? [{ kind: 'party' } as const] : []),
    ]),
  ];
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
    // The shared copy asserts what its source asserts (ADR 0014 §1).
    const claim = state.epistemics.claims.get(source.knowledgeId);
    if (claim) {
      events.push({
        type: 'ClaimSet',
        payload: {
          target: { kind: 'knowledge', knowledgeId },
          claim: { ...claim },
          source: { kind: 'knowledge', knowledgeId: source.knowledgeId },
        },
      });
    }
  });
  const memoryId = resolution.ids[willing.length];
  const topic = state.entities.get(topicId);
  if (memoryId === undefined || !topic) throw new Error('AskAbout ran out of resolved IDs');
  events.push(
    memoryEvent(state, actor.value, {
      memoryId,
      memoryKind: 'CONVERSATION',
      summary: investigationText(languageOf(state)).told(
        npc.name,
        actor.value.character.name,
        topic.name,
      ),
      participants: [characterId, npcId],
      relatedKnowledge: sharedIds,
      named: [npcId, characterId, topicId],
    }),
  );
  return accept(...events);
}
