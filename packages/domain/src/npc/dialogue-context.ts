import type { Attitude, EntityKind } from '@ltw/contracts';

import type { Acting } from '../investigation/acting.ts';
import { npcDisclosure } from '../investigation/disclosure.ts';
import { perceivedEntityIds } from '../investigation/perception.ts';
import { scopedKey, shownKey } from '../investigation/records.ts';
import type { RecordedEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';
import type { KnowledgeRecord } from '../knowledge/records.ts';
import type { MemoryRecord } from '../memory/records.ts';
import { attitudeOf } from '../relationships/records.ts';

/**
 * The minimal context an NPC speaks from (docs/adr/0020-npc-intelligence.md
 * §3, owner decision). Isolation is by construction: the NPC is given only
 * what it may say to this speaker now, so no instruction, and no player
 * words, can make it say more. Built from the state after the intent's
 * command. Never in it: SECRET records, guarded content, WORLD_TRUTH, DM
 * notes and descriptions, claims, clues, other holders' records, or
 * anything after the world clock. Entities the speaker does not know keep
 * their names out of it.
 *
 * Each line keeps its source ID for the trace; the AI gateway never shows
 * a provider any ID.
 */
export interface DialogueEntity {
  readonly entityId: string;
  readonly kind: EntityKind;
  /** Null when the speaker does not know the entity: its name must not reach the NPC's words. */
  readonly name: string | null;
}

export interface DialogueLine {
  /** The record or memory the text came from. */
  readonly sourceId: string;
  readonly text: string;
}

export interface NpcDialogueContext {
  readonly npc: DialogueEntity;
  readonly speaker: DialogueEntity;
  readonly attitude: Attitude;
  readonly worldTime: number;
  readonly place: DialogueEntity | null;
  /** What it perceives besides itself, the speaker, and the place. */
  readonly around: readonly DialogueEntity[];
  /** What the speaker asked about, or read it for, when the speaker knows it. */
  readonly topic: DialogueEntity | null;
  /** Its records the intent's command has just told the speaker's scope. */
  readonly justTold: readonly DialogueLine[];
  /** Its other records it may say now: told before, or shareable now (§2). */
  readonly mayTell: readonly DialogueLine[];
  /** PUBLIC records. */
  readonly common: readonly DialogueLine[];
  /** Recallable memories (§3a). */
  readonly memories: readonly DialogueLine[];
  /** Subjects of evidence the speaker's scope has shown it. */
  readonly shown: readonly DialogueEntity[];
  /** Subjects of records it will not tell, known to the speaker; never their content. */
  readonly guarded: readonly DialogueEntity[];
}

export interface DialogueContextRequest {
  /** The speaker as `checkTalk` found it on this same state. */
  readonly speaker: Acting;
  readonly npcId: string;
  readonly topicId: string | null;
  /** The NPC records the intent's command just shared (`sharedSources`). */
  readonly justShared: readonly string[];
}

/** Caps that bound what a provider is sent. */
export const DIALOGUE_LIMITS = {
  around: 12,
  mayTell: 12,
  common: 8,
  memories: 6,
  guarded: 8,
} as const;

/** Types that hold nothing back: an NPC's open question or a conflict it noticed. */
const NOT_HELD_BACK: ReadonlySet<KnowledgeRecord['knowledgeType']> = new Set([
  'UNKNOWN',
  'CONTRADICTION',
]);

export function npcDialogueContext(
  state: WorldState,
  request: DialogueContextRequest,
): NpcDialogueContext | null {
  const { speaker, npcId } = request;
  const npc = state.entities.get(npcId);
  if (npc?.kind !== 'npc') return null;
  const entity = (entityId: string): DialogueEntity | null => {
    const found = state.entities.get(entityId);
    if (!found) return null;
    return {
      entityId,
      kind: found.kind,
      name: speaker.known.has(entityId) ? found.name : null,
    };
  };
  const now = (record: KnowledgeRecord) =>
    record.knownSince === null || record.knownSince <= state.clock;
  const line = (record: KnowledgeRecord): DialogueLine => ({
    sourceId: record.knowledgeId,
    text: record.statement,
  });
  const { scopeKey } = speaker;

  const own = [...state.knowledge.values()].filter(
    (record) => record.scope.kind === 'NPC' && record.scope.npcId === npcId && now(record),
  );
  const told = (record: KnowledgeRecord) =>
    state.investigation.shared.has(scopedKey(scopeKey, record.knowledgeId));
  const disclosure = npcDisclosure(state, npcId, scopeKey, null);
  const shareable = new Set(disclosure.shareable.map((record) => record.knowledgeId));
  const justTold = own.filter(
    (record) => told(record) && request.justShared.includes(record.knowledgeId),
  );
  const mayTell = own.filter(
    (record) => !justTold.includes(record) && (told(record) || shareable.has(record.knowledgeId)),
  );
  const common = [...state.knowledge.values()].filter(
    (record) => record.scope.kind === 'PUBLIC' && now(record),
  );
  const sayable = new Set([...justTold, ...mayTell, ...common].map((record) => record.knowledgeId));

  const placeId = npc.placement?.locationId ?? null;
  const around = [...perceivedEntityIds(state, npcId)]
    .filter((id) => id !== npcId && id !== speaker.character.entityId && id !== placeId)
    .flatMap((id) => entity(id) ?? []);
  const guarded = unique(
    disclosure.withheld
      .filter((record) => now(record) && !NOT_HELD_BACK.has(record.knowledgeType))
      .flatMap((record) => record.subjects)
      .filter((id) => speaker.known.has(id)),
  ).flatMap((id) => entity(id) ?? []);
  const shown = [...speaker.known.keys()]
    .filter((id) => state.investigation.shown.has(shownKey(scopeKey, npcId, id)))
    .flatMap((id) => entity(id) ?? []);
  const topic =
    request.topicId !== null && speaker.known.has(request.topicId) ? entity(request.topicId) : null;

  return {
    npc: entity(npcId) ?? { entityId: npcId, kind: 'npc', name: null },
    speaker: {
      entityId: speaker.character.entityId,
      kind: speaker.character.kind,
      name: speaker.character.name,
    },
    attitude: attitudeOf(state, npcId),
    worldTime: state.clock,
    place: placeId === null ? null : entity(placeId),
    around: around.slice(0, DIALOGUE_LIMITS.around),
    topic,
    justTold: justTold.map(line),
    mayTell: mayTell.slice(0, DIALOGUE_LIMITS.mayTell).map(line),
    common: common.slice(0, DIALOGUE_LIMITS.common).map(line),
    memories: recallable(state, npcId, sayable).slice(0, DIALOGUE_LIMITS.memories),
    shown,
    guarded: guarded.slice(0, DIALOGUE_LIMITS.guarded),
  };
}

/**
 * Its own memories that cite at least one record, every one of which it may
 * say now, and PUBLIC memories (§3a). A memory's summary is the DM's text: a
 * summary that touches a secret must cite the secret's record, and then it
 * is never recallable.
 */
function recallable(
  state: WorldState,
  npcId: string,
  sayable: ReadonlySet<string>,
): DialogueLine[] {
  const own = (memory: MemoryRecord) =>
    memory.scope.kind === 'NPC' &&
    memory.scope.npcId === npcId &&
    memory.relatedKnowledge.length > 0 &&
    memory.relatedKnowledge.every((knowledgeId) => sayable.has(knowledgeId));
  return [...state.memories.values()]
    .filter(
      (memory) =>
        memory.occurredAt <= state.clock && (memory.scope.kind === 'PUBLIC' || own(memory)),
    )
    .map((memory) => ({ sourceId: memory.memoryId, text: memory.summary }));
}

/** Every source the context drew on, for the trace (ADR 0017 §7). */
export function dialogueSourceIds(context: NpcDialogueContext): string[] {
  const entities = [
    context.npc,
    context.speaker,
    ...(context.place ? [context.place] : []),
    ...context.around,
    ...(context.topic ? [context.topic] : []),
    ...context.shown,
    ...context.guarded,
  ].map((entity) => entity.entityId);
  const lines = [
    ...context.justTold,
    ...context.mayTell,
    ...context.common,
    ...context.memories,
  ].map((item) => item.sourceId);
  return unique(['world#clock', `relationship#${context.npc.entityId}`, ...entities, ...lines]);
}

/** The NPC records a command shared, from its recorded events. */
export function sharedSources(history: readonly RecordedEvent[], commandId: string): string[] {
  return history.flatMap((event) =>
    event.causation.commandId === commandId && event.type === 'InformationShared'
      ? [event.payload.sourceKnowledgeId]
      : [],
  );
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
