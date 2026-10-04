import type { KernelEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';
import { acting, memoryEvent, type Acting } from './acting.ts';
import type { Premise } from './events.ts';
import { perceivedEntityIds } from './perception.ts';
import { MAX_CLUES_PER_METHOD, scopedKey, type Clue } from './records.ts';

/**
 * Turning revealed clues into knowledge (docs/adr/0013-investigation.md §2):
 * one EVIDENCE record per clue in the discoverer's scope, carrying a copy of
 * the clue's DM claim (ADR 0014). Shared by examination and Detect Magic.
 */
export function clueRecordEvents(
  state: WorldState,
  scope: Acting['scope'],
  clue: Clue,
  knowledgeId: string,
): KernelEvent[] {
  const claim = state.epistemics.clueClaims.get(clue.clueId);
  return [
    {
      type: 'KnowledgeAssigned',
      payload: {
        knowledgeId,
        scope,
        knowledgeType: 'EVIDENCE',
        statement: clue.statement,
        subjects: [...new Set([clue.entityId, ...clue.subjects])],
        attributedTo: null,
        relations: [],
        knownSince: state.clock,
      },
    },
    ...(claim
      ? [
          {
            type: 'ClaimSet',
            payload: {
              target: { kind: 'knowledge', knowledgeId },
              claim: { ...claim },
              source: { kind: 'clue', clueId: clue.clueId },
            },
          } satisfies KernelEvent,
        ]
      : []),
  ];
}

/**
 * Detect Magic (docs/adr/0015-combat-engine.md §3): the caster senses the
 * DM's `magic` clues on every entity it perceives and `sensed` accepts (in
 * combat, combatants within 30 ft; outside it, the whole room) that its scope
 * has not yet found, at most `MAX_CLUES_PER_METHOD` per cast. Nothing found
 * reveals nothing, exactly like a search with nothing to find. `ids` are the
 * command's resolved IDs (records first, then the memory).
 */
export function magicDiscoveryEvents(
  state: WorldState,
  characterId: string,
  ids: readonly string[],
  sensed: (entityId: string) => boolean = () => true,
): KernelEvent[] {
  const actor = acting(state, characterId);
  if (!actor.ok) return [];
  const { scope, scopeKey } = actor.value;
  const perceived = perceivedEntityIds(state, characterId);
  const found = [...state.investigation.clues.values()]
    .filter(
      (clue) =>
        clue.method === 'magic' &&
        perceived.has(clue.entityId) &&
        sensed(clue.entityId) &&
        !state.investigation.revealed.has(scopedKey(scopeKey, clue.clueId)),
    )
    .slice(0, MAX_CLUES_PER_METHOD)
    .map((clue, index) => {
      const knowledgeId = ids[index];
      if (knowledgeId === undefined) throw new Error('Detect Magic ran out of resolved IDs');
      return { clue, knowledgeId };
    });
  if (found.length === 0) return [];

  const entities = [...new Set(found.map(({ clue }) => clue.entityId))];
  const events: KernelEvent[] = entities.flatMap((entityId) => {
    const here = found.filter(({ clue }) => clue.entityId === entityId);
    return [
      {
        type: 'EvidenceExamined',
        payload: {
          characterId,
          entityId,
          method: 'magic',
          scope: scopeKey,
          roll: null,
          revealed: here.map(({ clue, knowledgeId }) => ({ clueId: clue.clueId, knowledgeId })),
        },
      } satisfies KernelEvent,
      ...here.flatMap(({ clue, knowledgeId }) => clueRecordEvents(state, scope, clue, knowledgeId)),
    ];
  });
  const memoryId = ids[found.length];
  const first = found[0];
  if (memoryId === undefined || !first) throw new Error('Detect Magic ran out of resolved IDs');
  events.push(
    memoryEvent(state, actor.value, {
      memoryId,
      memoryKind: 'DISCOVERY',
      summary: `${actor.value.character.name} sensed magic: ${first.clue.statement}`,
      participants: [characterId, ...entities].slice(0, 16),
      relatedKnowledge: found.map(({ knowledgeId }) => knowledgeId),
    }),
  );
  return events;
}

/**
 * What a Detect Magic result relied on besides what it revealed (Gate 03
 * remediation, negative premises): where the caster stood and, in the party,
 * its membership; every magic clue the scope had already found; and where
 * every other magic-bearing entity was, since a result that did not reach it
 * relied on it being out of reach. Undoing any of them while the cast stands
 * is then UNDO_UNSAFE.
 */
export function magicSensingPremises(
  state: WorldState,
  characterId: string,
  sensed: (entityId: string) => boolean = () => true,
): Premise[] {
  const actor = acting(state, characterId);
  if (!actor.ok) return [];
  const { scopeKey, scope } = actor.value;
  const perceived = perceivedEntityIds(state, characterId);
  const premises: Premise[] = [
    { kind: 'perceived', entityId: characterId },
    ...(scope.kind === 'PARTY' ? [{ kind: 'party' } as const] : []),
  ];
  const elsewhere = new Set<string>();
  for (const clue of state.investigation.clues.values()) {
    if (clue.method !== 'magic') continue;
    if (state.investigation.revealed.has(scopedKey(scopeKey, clue.clueId))) {
      premises.push({ kind: 'revealed', scope: scopeKey, clueId: clue.clueId });
    } else if (!perceived.has(clue.entityId) || !sensed(clue.entityId)) {
      elsewhere.add(clue.entityId);
    }
  }
  for (const entityId of elsewhere) premises.push({ kind: 'placement', entityId });
  return premises;
}
