import { SECONDS_PER_DAY, type MemoryKind, type MemorySuggestionView } from '@ltw/contracts';

import type { RecordedEvent } from '../kernel/events.ts';
import { effectiveEvents, placementAt } from '../kernel/projections/world-view.ts';
import type { WorldState } from '../kernel/state.ts';
import { chronicleText, languageOf } from '../language/index.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { knownEntityIds } from '../knowledge/projection.ts';
import { sourceIndex, sourcesOf } from './views.ts';

/**
 * Memory suggestions (docs/adr/0024-chronicle.md §6; owner decision of
 * 2026-10-04): salient moments a party or character took part in that its
 * scope has no memory of, offered to the DM as `RecordMemory` drafts. Nothing
 * is recorded here: the DM reviews, edits, and submits, and the World Engine
 * checks the memory as any other (ADR 0010). Drafts name only what the scope
 * knows; anything else is described, not named.
 */
export type SuggestionScope =
  { readonly kind: 'PARTY' } | { readonly kind: 'CHARACTER'; readonly characterId: string };

/** A memory of the same kind within ten minutes already covers a moment. */
const COVERED_WITHIN = 600;

interface Draft {
  readonly reason: MemorySuggestionView['reason'];
  readonly anchor: RecordedEvent;
  readonly cited: readonly RecordedEvent[];
  readonly memoryKind: MemoryKind;
  readonly summary: string;
  readonly occurredAt: number;
  readonly locationId: string | null;
  readonly participants: readonly string[];
  readonly relatedKnowledge: readonly string[];
  readonly salience: number;
}

export function memorySuggestions(
  state: WorldState,
  history: readonly RecordedEvent[],
  scope: SuggestionScope,
  from: number,
  to: number,
): MemorySuggestionView[] {
  const members =
    scope.kind === 'PARTY' ? new Set(state.roster.keys()) : new Set([scope.characterId]);
  const perspective = holderPerspective(state, scope);
  const known = knownEntityIds(state, perspective);
  const words = chronicleText(languageOf(state));
  const named = (id: string, otherwise: string) =>
    known.has(id) ? (state.entities.get(id)?.name ?? otherwise) : otherwise;
  const rootOf = (locationId: string) => {
    let id = locationId;
    for (let parent = state.entities.get(id)?.location?.parentId ?? null; parent !== null;) {
      id = parent;
      parent = state.entities.get(id)?.location?.parentId ?? null;
    }
    return id;
  };
  const whereAt = (time: number) => {
    for (const member of members) {
      const at = placementAt(state, history, member, time);
      if (at !== null) return at;
    }
    return null;
  };

  const events = effectiveEvents(history, state);
  const drafts: Draft[] = [];
  const visitedRoots = new Set<string>();
  const lastRoot = new Map<string, string>();
  events.forEach((event, position) => {
    const inWindow = event.worldTime >= from && event.worldTime <= to;
    switch (event.type) {
      case 'CombatStarted': {
        const ids = event.payload.combatants.map((combatant) => combatant.entityId);
        if (!inWindow || !ids.some((id) => members.has(id))) break;
        const later = events.slice(position + 1);
        const end = later.findIndex((e) => e.type === 'CombatEnded');
        const during = end === -1 ? later : later.slice(0, end + 1);
        const deaths = during.filter(
          (e) =>
            e.type === 'EntityStatusChanged' &&
            e.payload.to === 'dead' &&
            ids.includes(e.payload.entityId),
        );
        const counters = during.filter(
          (e) => e.type === 'ReactionUsed' && members.has(e.payload.reactorId),
        );
        const foes = ids.filter((id) => !members.has(id));
        const foeWords = foes.every((id) => known.has(id))
          ? foes.map((id) => named(id, words.aFoe)).join(', ')
          : words.foes(foes.length);
        const place = named(event.payload.locationId, words.unknownPlace);
        drafts.push({
          reason: 'battle',
          anchor: event,
          cited: [event, ...deaths, ...counters, ...during.filter((e) => e.type === 'CombatEnded')],
          memoryKind: 'OBSERVATION',
          summary: words.battle(place, foeWords, deaths.length, counters.length > 0),
          occurredAt: event.worldTime,
          locationId: event.payload.locationId,
          participants: ids.slice(0, 16),
          relatedKnowledge: [],
          salience: 4,
        });
        break;
      }
      case 'ContradictionDetected': {
        const { knowledgeId, scope: held, subjectId } = event.payload;
        const ours =
          scope.kind === held.kind &&
          (held.kind !== 'CHARACTER' ||
            (scope.kind === 'CHARACTER' && held.characterId === scope.characterId));
        const record = state.knowledge.get(knowledgeId);
        if (!inWindow || !ours || !record) break;
        drafts.push({
          reason: 'contradiction',
          anchor: event,
          cited: [event],
          memoryKind: 'DISCOVERY',
          summary: words.accountsDisagree(record.statement),
          occurredAt: event.worldTime,
          locationId: whereAt(event.worldTime),
          participants: known.has(subjectId) ? [subjectId] : [],
          relatedKnowledge: [knowledgeId],
          salience: 5,
        });
        break;
      }
      case 'EntityPlaced': {
        const { entityId, locationId } = event.payload;
        if (!members.has(entityId)) break;
        const root = rootOf(locationId);
        const before = lastRoot.get(entityId);
        lastRoot.set(entityId, root);
        const returned = visitedRoots.has(root);
        visitedRoots.add(root);
        if (!inWindow || before === undefined || before === root) break;
        // Where the member stood once that moment was over: a memory must be had
        // where its holder was (ADR 0010). Passing through within the same instant
        // into another region is no arrival.
        const settled = placementAt(state, history, entityId, event.worldTime);
        if (settled === null || rootOf(settled) !== root) break;
        const covered = drafts.some(
          (d) =>
            d.reason === 'arrival' &&
            d.occurredAt === event.worldTime &&
            d.locationId !== null &&
            rootOf(d.locationId) === root,
        );
        if (covered) break;
        const placeName = named(root, words.unknownPlace);
        drafts.push({
          reason: 'arrival',
          anchor: event,
          cited: [event],
          memoryKind: 'OBSERVATION',
          summary: returned ? words.returned(placeName) : words.arrived(placeName),
          occurredAt: event.worldTime,
          locationId: settled,
          participants: [entityId],
          relatedKnowledge: [],
          salience: 3,
        });
        break;
      }
      case 'WorldTimeAdvanced': {
        const { from: before, to: after } = event.payload;
        const day = Math.floor(after / SECONDS_PER_DAY) + 1;
        if (!inWindow || day === Math.floor(before / SECONDS_PER_DAY) + 1) break;
        const where = whereAt(after);
        if (where === null) break;
        drafts.push({
          reason: 'new-day',
          anchor: event,
          cited: [event],
          memoryKind: 'OBSERVATION',
          summary: words.dayDawned(day),
          occurredAt: after,
          locationId: where,
          participants: [...members].slice(0, 16),
          relatedKnowledge: [],
          salience: 2,
        });
        break;
      }
      default:
        break;
    }
  });

  const remembered = [...state.memories.values()].filter(
    (memory) =>
      memory.scope.kind === scope.kind &&
      (scope.kind !== 'CHARACTER' ||
        (memory.scope.kind === 'CHARACTER' && memory.scope.characterId === scope.characterId)),
  );
  const index = sourceIndex(state, history);
  return drafts
    .filter(
      (draft) =>
        !remembered.some(
          (memory) =>
            memory.memoryKind === draft.memoryKind &&
            Math.abs(memory.occurredAt - draft.occurredAt) <= COVERED_WITHIN,
        ),
    )
    .map((draft) => ({
      suggestionId: `${draft.reason}:${draft.anchor.eventId}`,
      occurredAt: draft.occurredAt,
      reason: draft.reason,
      sources: sourcesOf(index, true, {
        knowledgeIds: draft.relatedKnowledge,
      }).concat(
        draft.cited.map((event) => ({
          eventId: event.eventId,
          eventType: event.type,
          sequence: event.sequence,
        })),
      ),
      command: {
        type: 'RecordMemory',
        scope: scope.kind === 'PARTY' ? { kind: 'PARTY' } : { ...scope },
        memoryKind: draft.memoryKind,
        summary: draft.summary,
        occurredAt: draft.occurredAt,
        ...(draft.locationId === null ? {} : { locationId: draft.locationId }),
        participants: [...draft.participants],
        relatedKnowledge: [...draft.relatedKnowledge],
        salience: draft.salience,
      },
    }));
}
