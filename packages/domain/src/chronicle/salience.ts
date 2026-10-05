import { SECONDS_PER_DAY } from '@ltw/contracts';

import type { RecordedEvent } from '../kernel/events.ts';
import { footprintOf } from '../kernel/facts.ts';
import { effectiveEvents } from '../kernel/projections/world-view.ts';
import type { WorldState } from '../kernel/state.ts';
import { chronicleText, languageOf } from '../language/index.ts';
import type { StoredEntry } from './records.ts';

/**
 * The DM's chronicle from structured events (docs/adr/0024-chronicle.md §2):
 * effective events in a world-time window, rated by a fixed salience table,
 * each told in fixed words with the names the DM knows. Only events rated 3
 * or more are told; a chapter keeps the most salient, in world-time order.
 */
export interface SalientEvent {
  readonly entry: Omit<StoredEntry, 'key'>;
  /** The facts the event wrote; a chapter telling it rests on them (and on the names it uses). */
  readonly rests: readonly string[];
}

export const MIN_EVENT_SALIENCE = 3;

const dayOf = (time: number) => Math.floor(time / SECONDS_PER_DAY) + 1;

export function salientEvents(
  state: WorldState,
  history: readonly RecordedEvent[],
  from: number,
  to: number,
): SalientEvent[] {
  const words = chronicleText(languageOf(state));
  const name = (id: string) => state.entities.get(id)?.name ?? id;
  const statementOf = (knowledgeId: string) => state.knowledge.get(knowledgeId);
  const indexes = new Map<string, number>();
  const told: SalientEvent[] = [];
  for (const event of effectiveEvents(history, state)) {
    const { commandId } = event.causation;
    const index = indexes.get(commandId) ?? 0;
    indexes.set(commandId, index + 1);
    if (event.worldTime < from || event.worldTime > to) continue;
    const base = {
      occurredAt: event.worldTime,
      source: { kind: 'event' as const, commandId, index, eventType: event.type },
      memoryKind: null,
      locationId: null as string | null,
      participants: [] as string[],
      knowledge: [] as StoredEntry['knowledge'],
    };
    let entry: Omit<StoredEntry, 'key'> | null = null;
    switch (event.type) {
      case 'EntityStatusChanged': {
        const { entityId, to: status } = event.payload;
        if (status === 'active') break;
        entry = {
          ...base,
          text: status === 'dead' ? words.died(name(entityId)) : words.destroyed(name(entityId)),
          salience: 5,
          participants: [entityId],
        };
        break;
      }
      case 'CombatStarted': {
        const { locationId, combatants } = event.payload;
        const ids = combatants.map((combatant) => combatant.entityId);
        entry = {
          ...base,
          text: words.fightBroke(name(locationId), ids.map(name).join(', ')),
          salience: 4,
          locationId,
          participants: ids.slice(0, 16),
        };
        break;
      }
      case 'CombatEnded':
        entry = { ...base, text: words.fightEnded, salience: 3 };
        break;
      case 'ReactionUsed': {
        const { reactorId, reaction } = event.payload;
        entry = {
          ...base,
          text: words.answeredWith(name(reactorId), reaction),
          salience: 4,
          participants: [reactorId],
        };
        break;
      }
      case 'ContradictionDetected': {
        const record = statementOf(event.payload.knowledgeId);
        if (!record) break;
        entry = {
          ...base,
          text: record.statement,
          salience: 5,
          participants: [event.payload.subjectId],
          knowledge: [
            {
              knowledgeId: record.knowledgeId,
              knowledgeType: record.knowledgeType,
              statement: record.statement,
            },
          ],
        };
        break;
      }
      case 'InformationShared': {
        const { npcId, characterId, knowledgeId } = event.payload;
        const record = statementOf(knowledgeId);
        if (!record) break;
        entry = {
          ...base,
          text: words.toldTo(name(npcId), name(characterId), record.statement),
          salience: 4,
          participants: [npcId, characterId],
          knowledge: [
            { knowledgeId, knowledgeType: record.knowledgeType, statement: record.statement },
          ],
        };
        break;
      }
      case 'EvidenceExamined': {
        const { characterId, entityId } = event.payload;
        entry = {
          ...base,
          text: words.examined(name(characterId), name(entityId)),
          salience: 3,
          participants: [characterId, entityId],
        };
        break;
      }
      case 'KnowledgeAssigned': {
        const { knowledgeId, knowledgeType, statement } = event.payload;
        if (knowledgeType !== 'HYPOTHESIS') break;
        entry = {
          ...base,
          text: words.hypothesis(statement),
          salience: 3,
          knowledge: [{ knowledgeId, knowledgeType, statement }],
        };
        break;
      }
      case 'WorldTimeAdvanced': {
        const { from: before, to: after } = event.payload;
        if (dayOf(after) === dayOf(before)) break;
        entry = { ...base, text: words.dayBegan(dayOf(after)), salience: 3 };
        break;
      }
      case 'EntityPlaced': {
        const { entityId, locationId } = event.payload;
        if (!state.roster.has(entityId)) break;
        entry = {
          ...base,
          text: words.wentTo(name(entityId), name(locationId)),
          salience: 3,
          locationId,
          participants: [entityId],
        };
        break;
      }
      case 'EntityCreated':
        if (event.payload.kind !== 'npc') break;
        entry = {
          ...base,
          text: words.enteredStory(name(event.payload.entityId)),
          salience: 3,
          participants: [event.payload.entityId],
        };
        break;
      default:
        break;
    }
    if (entry && entry.salience >= MIN_EVENT_SALIENCE) {
      told.push({ entry, rests: footprintOf(event).writes });
    }
  }
  return told;
}
