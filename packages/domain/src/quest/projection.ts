import { isPartyMember } from '../knowledge/party.ts';
import type {
  ChronicleSourceView,
  QuestDefinition,
  QuestMilestone,
  QuestTransitionView,
  QuestView,
} from '@ltw/contracts';

import type { RecordedEvent } from '../kernel/events.ts';
import { effectiveEvents, isWithinLocation } from '../kernel/projections/world-view.ts';
import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';

/**
 * The party's quest log (docs/adr/0025-ravenford-integration.md §2; owner
 * decisions of 2026-10-04). A projection, never world truth (invariant 15):
 * computed on read from effective history, stored nowhere, read by no
 * decision. Only the party's own history counts: records and memories in
 * the PARTY scope, its members' movements and examinations, and fights they
 * took part in. The public rumor of an overdue caravan activates nothing.
 *
 * Visible to the PARTY perspective, a party member's own CHARACTER
 * perspective, and the DM (who also sees sequences). Anything else sees no
 * quest at all.
 */
interface Occurrence {
  readonly worldTime: number;
  readonly events: readonly RecordedEvent[];
}

const PARTY = 'PARTY';

function partyCanRead(state: WorldState, perspective: ResolvedPerspective): boolean {
  if (perspective.scopes === 'ALL' || perspective.kind === 'PARTY') return true;
  return (
    perspective.kind === 'CHARACTER' &&
    perspective.holderId !== null &&
    isPartyMember(state, perspective.holderId)
  );
}

/** Every occurrence of what activates or advances a quest, from the party's own history. */
function occurrences(
  state: WorldState,
  events: readonly RecordedEvent[],
  quest: QuestDefinition,
): { activation: Occurrence[]; milestones: Map<string, Occurrence[]> } {
  // Everything a milestone asks of the past is read as it was at that event,
  // never from the present state (Gate 05, G05-M01): who was in the party,
  // where each thing was, and what each record was about. Location nesting
  // is timeless (ADR 0006 §3).
  const members = new Set<string>();
  const placements = new Map<string, string>();
  const subjectsOf = new Map<string, readonly string[]>();
  const within = (locationId: string | null, outer: string) =>
    locationId !== null &&
    state.entities.has(locationId) &&
    state.entities.has(outer) &&
    isWithinLocation(state, locationId, outer);
  const activation: Occurrence[] = [];
  const milestones = new Map<string, Occurrence[]>(quest.milestones.map((m) => [m.stage, []]));
  const add = (milestone: QuestMilestone, occurrence: Occurrence) => {
    milestones.get(milestone.stage)?.push(occurrence);
  };
  const encounters = new Map<
    string,
    { locationId: string; fighters: string[]; start: RecordedEvent }
  >();
  const statuses = new Map<string, string>();

  for (const event of events) {
    switch (event.type) {
      case 'PreparedPartyEstablished':
        // Initial placements precede this event; they are prepared state, never played visits.
        for (const id of event.payload.characterIds) members.add(id);
        break;
      case 'CharacterAssigned':
        members.add(event.payload.characterId);
        break;
      case 'KnowledgeAssigned': {
        const record = event.payload;
        subjectsOf.set(record.knowledgeId, record.subjects);
        if (record.scope.kind !== PARTY) break;
        const at = { worldTime: record.knownSince ?? event.worldTime, events: [event] };
        if (record.subjects.includes(quest.activation.subject)) activation.push(at);
        for (const milestone of quest.milestones) {
          const about = (subject: string) => record.subjects.includes(subject);
          if (
            milestone.kind === 'hypothesized' &&
            record.knowledgeType === 'HYPOTHESIS' &&
            about(milestone.subject)
          ) {
            add(milestone, at);
          } else if (
            milestone.kind === 'contradiction-found' &&
            record.knowledgeType === 'CONTRADICTION' &&
            about(milestone.subject)
          ) {
            add(milestone, at);
          } else if (
            milestone.kind === 'told-by' &&
            record.attributedTo === milestone.informant &&
            about(milestone.subject)
          ) {
            add(milestone, at);
          }
        }
        break;
      }
      case 'MemoryRecorded': {
        const memory = event.payload;
        if (memory.scope.kind !== PARTY) break;
        const aboutSubject =
          memory.participants.includes(quest.activation.subject) ||
          memory.relatedKnowledge.some((id) =>
            subjectsOf.get(id)?.includes(quest.activation.subject),
          );
        if (aboutSubject) activation.push({ worldTime: memory.occurredAt, events: [event] });
        break;
      }
      case 'EntityPlaced': {
        const { entityId, locationId, since } = event.payload;
        placements.set(entityId, locationId);
        if (!members.has(entityId)) break;
        const at = { worldTime: since ?? event.worldTime, events: [event] };
        for (const milestone of quest.milestones) {
          if (
            (milestone.kind === 'reached' || milestone.kind === 'returned-to') &&
            within(locationId, milestone.locationId)
          ) {
            add(milestone, at);
          }
        }
        break;
      }
      case 'EvidenceExamined': {
        const { characterId, entityId, scope } = event.payload;
        if (!members.has(characterId) || scope !== PARTY) break;
        // Where it was when examined: a later move changes nothing here.
        const place = placements.get(entityId) ?? entityId;
        for (const milestone of quest.milestones) {
          if (milestone.kind === 'examined-at' && within(place, milestone.locationId)) {
            add(milestone, { worldTime: event.worldTime, events: [event] });
          }
        }
        break;
      }
      case 'EntityStatusChanged':
        statuses.set(event.payload.entityId, event.payload.to);
        break;
      case 'CombatStarted':
        encounters.set(event.payload.encounterId, {
          locationId: event.payload.locationId,
          fighters: event.payload.combatants.map((c) => c.entityId),
          start: event,
        });
        break;
      case 'CombatEnded': {
        const fight = encounters.get(event.payload.encounterId);
        if (!fight) break;
        const survivors = fight.fighters.filter(
          (id) => members.has(id) && (statuses.get(id) ?? 'active') === 'active',
        );
        if (survivors.length === 0) break;
        for (const milestone of quest.milestones) {
          if (
            milestone.kind === 'survived-fight-at' &&
            within(fight.locationId, milestone.locationId)
          ) {
            add(milestone, { worldTime: event.worldTime, events: [fight.start, event] });
          }
        }
        break;
      }
      default:
        break;
    }
  }
  return { activation, milestones };
}

const earliest = (list: readonly Occurrence[], notBefore: number) =>
  list
    .filter((occurrence) => occurrence.worldTime >= notBefore)
    .sort(
      (a, b) =>
        a.worldTime - b.worldTime || (a.events[0]?.sequence ?? 0) - (b.events[0]?.sequence ?? 0),
    )[0];

function sourcesOf(events: readonly RecordedEvent[], dm: boolean): ChronicleSourceView[] {
  return events.map((event) => ({
    eventId: event.eventId,
    eventType: event.type,
    ...(dm ? { sequence: event.sequence } : {}),
  }));
}

/** One quest as the party knows it; null while it is not active for the party. */
export function questFor(
  state: WorldState,
  history: readonly RecordedEvent[],
  quest: QuestDefinition,
  dm: boolean,
): QuestView | null {
  const found = occurrences(state, effectiveEvents(history, state), quest);
  const activated = earliest(found.activation, Number.NEGATIVE_INFINITY);
  if (!activated) return null;
  const reached = new Map<string, Occurrence>();
  // A return counts only after the stage it follows; resolve the others first.
  const ordered = [
    ...quest.milestones.filter((m) => m.kind !== 'returned-to'),
    ...quest.milestones.filter((m) => m.kind === 'returned-to'),
  ];
  for (const milestone of ordered) {
    const after =
      milestone.kind === 'returned-to'
        ? reached.get(milestone.after)
        : { worldTime: activated.worldTime, events: [] };
    if (!after) continue;
    const list = (found.milestones.get(milestone.stage) ?? []).filter(
      (occurrence) =>
        milestone.kind !== 'returned-to' ||
        (occurrence.events[0]?.sequence ?? 0) > Math.max(...after.events.map((e) => e.sequence)),
    );
    const first = earliest(list, after.worldTime);
    if (first) reached.set(milestone.stage, first);
  }
  // In world-time order; within one world time, in the order the history recorded them.
  const told: (Occurrence & { stage: string; summary: string; activation: boolean })[] = [
    { ...activated, stage: 'activated', summary: quest.activation.summary, activation: true },
    ...quest.milestones.flatMap((milestone) => {
      const first = reached.get(milestone.stage);
      return first
        ? [{ ...first, stage: milestone.stage, summary: milestone.summary, activation: false }]
        : [];
    }),
  ];
  const sequenceOf = (occurrence: Occurrence) =>
    Math.max(...occurrence.events.map((e) => e.sequence));
  told.sort(
    (a, b) =>
      a.worldTime - b.worldTime ||
      Number(b.activation) - Number(a.activation) ||
      sequenceOf(a) - sequenceOf(b),
  );
  return {
    questId: quest.questId,
    title: quest.title,
    transitions: told.map((occurrence): QuestTransitionView => ({
      type: occurrence.activation ? 'QuestActivated' : 'QuestUpdated',
      stage: occurrence.stage,
      worldTime: occurrence.worldTime,
      summary: occurrence.summary,
      sources: sourcesOf(occurrence.events, dm),
    })),
  };
}

/** The active quests a perspective may read: the party's, for the party and the DM. */
export function questLog(
  snapshot: { readonly state: WorldState; readonly history: readonly RecordedEvent[] },
  perspective: ResolvedPerspective,
  quests: readonly QuestDefinition[],
): QuestView[] {
  if (!partyCanRead(snapshot.state, perspective)) return [];
  const dm = perspective.scopes === 'ALL';
  return quests.flatMap((quest) => questFor(snapshot.state, snapshot.history, quest, dm) ?? []);
}
