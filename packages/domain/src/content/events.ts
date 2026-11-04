import type { KernelEventOf, RecordedEvent, Restore } from '../kernel/events.ts';
import { facts, type FactKey } from '../kernel/fact-keys.ts';
import type { Footprint } from '../kernel/facts.ts';
import type { WorldState } from '../kernel/state.ts';
import {
  QUEST_EVENT_TYPES,
  applyQuestEvent,
  applyQuestRestore,
  questFootprint,
  questRestores,
  type QuestEventType,
} from '../quest/hand-quests.ts';
import {
  TRAVEL_EVENT_TYPES,
  applyTravelEvent,
  applyTravelRestore,
  travelFootprint,
  travelRestores,
  type TravelEventType,
} from '../travel/map.ts';

/**
 * The campaign's content the DM keeps by hand (docs/adr/0057-encounters-maps-loot.md §10,
 * docs/adr/0058-campaign-content.md §2): the world map's pins and routes, a journey's record, the
 * quests by hand. One guard for the kernel's fold, footprints and undo, each family by its rules.
 */
export type ContentEventType = TravelEventType | QuestEventType;
const TRAVEL: ReadonlySet<string> = new Set(TRAVEL_EVENT_TYPES);
const CONTENT: ReadonlySet<string> = new Set([...TRAVEL_EVENT_TYPES, ...QUEST_EVENT_TYPES]);

export const isContentEvent = <T extends { readonly type: string }>(
  event: T,
): event is Extract<T, { type: ContentEventType }> => CONTENT.has(event.type);

const isTravel = <T extends { readonly type: string }>(
  event: T,
): event is Extract<T, { type: TravelEventType }> => TRAVEL.has(event.type);

export const applyContentEvent = (
  state: WorldState,
  event: Extract<RecordedEvent, { type: ContentEventType }>,
): WorldState => (isTravel(event) ? applyTravelEvent(state, event) : applyQuestEvent(state, event));

export const contentFootprint = (event: KernelEventOf<ContentEventType>): Footprint =>
  isTravel(event) ? travelFootprint(event) : questFootprint(event);

export const contentRestores = (
  event: KernelEventOf<ContentEventType>,
  before: WorldState,
): Restore[] => (isTravel(event) ? travelRestores(event, before) : questRestores(event, before));

type ContentRestore = Extract<Restore, { fact: 'mapPins' | 'route' | 'handQuest' }>;
const CONTENT_FACTS: ReadonlySet<string> = new Set(['mapPins', 'route', 'handQuest']);
export const isContentRestore = (restore: Restore): restore is ContentRestore =>
  CONTENT_FACTS.has(restore.fact);

export function applyContentRestore(state: WorldState, restore: ContentRestore): WorldState {
  return restore.fact === 'handQuest'
    ? applyQuestRestore(state, restore)
    : applyTravelRestore(state, restore);
}

export function contentRestoredFacts(restore: ContentRestore): FactKey[] {
  switch (restore.fact) {
    case 'mapPins':
      return [facts.mapPins(restore.regionId)];
    case 'route':
      return [facts.route(restore.key)];
    case 'handQuest':
      return [facts.handQuest(restore.questId)];
  }
}
