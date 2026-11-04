import {
  MAX_MAP_PINS,
  TRAVEL_PACES,
  TRAVEL_TERRAINS,
  entityIdSchema,
  routeKey,
} from '@ltw/contracts';
import { z } from 'zod';

import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { KernelEventOf, RecordedEvent, Restore } from '../kernel/events.ts';
import { entityChecked, facts } from '../kernel/fact-keys.ts';
import type { Footprint } from '../kernel/facts.ts';
import { withEntry, withoutEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';

/**
 * The world map's facts (docs/adr/0057-encounters-maps-loot.md §10): a region's pins — the places
 * its picture shows, where — and the routes between places, each with its miles, terrain and
 * whether a good road runs, keyed by the pair. A journey along a route is recorded as it happened
 * (`PartyTravelled`); its clock, places and Exhaustion are their own events.
 */
const pin = z
  .object({ placeId: entityIdSchema, x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
  .strict();
export type MapPin = z.infer<typeof pin>;
const pins = z.array(pin).max(MAX_MAP_PINS);

const route = z
  .object({
    fromId: entityIdSchema,
    toId: entityIdSchema,
    miles: z.number().int().min(1).max(1_000),
    terrain: z.enum(TRAVEL_TERRAINS),
    road: z.boolean(),
  })
  .strict();
export type RouteRecord = z.infer<typeof route>;

export const mapPinsSetPayloadSchema = z
  .object({ regionId: entityIdSchema, pins: pins.nullable() })
  .strict();
export const routeSetPayloadSchema = z
  .object({ key: z.string().min(3).max(140), route: route.nullable() })
  .strict();
export const partyTravelledPayloadSchema = z
  .object({
    fromId: entityIdSchema,
    toId: entityIdSchema,
    pace: z.enum(TRAVEL_PACES),
    miles: z.number().int().min(1).max(1_000),
    /** Hours on the road, and the days they took (a day's travel up to the hours asked). */
    hours: z.number().int().min(1).max(1_000),
    days: z.number().int().min(1).max(500),
    travellerIds: z.array(entityIdSchema).min(1).max(12),
  })
  .strict();

export const travelRestoreSchemas = [
  z
    .object({ fact: z.literal('mapPins'), regionId: entityIdSchema, value: pins.nullable() })
    .strict(),
  z.object({ fact: z.literal('route'), key: z.string(), value: route.nullable() }).strict(),
] as const;

export const TRAVEL_EVENT_TYPES = ['MapPinsSet', 'RouteSet', 'PartyTravelled'] as const;
export type TravelEventType = (typeof TRAVEL_EVENT_TYPES)[number];
const TRAVEL_EVENTS: ReadonlySet<string> = new Set(TRAVEL_EVENT_TYPES);
export const isTravelEvent = <T extends { readonly type: string }>(
  event: T,
): event is Extract<T, { type: TravelEventType }> => TRAVEL_EVENTS.has(event.type);

const isPlace = (state: WorldState, id: string) => {
  const entity = state.entities.get(id);
  return entity?.kind === 'location' && entity.status === 'active';
};

export function decideSetMapPins(
  state: WorldState,
  command: ResolvedCommandOf<'SetMapPins'>,
): Decision {
  if (!isPlace(state, command.regionId)) return reject('ENTITY_NOT_FOUND', 'A map is a place’s');
  const unknown = command.pins.find((one) => !isPlace(state, one.placeId));
  if (unknown) return reject('ENTITY_NOT_FOUND', `"${unknown.placeId}" is no place`);
  const before = state.mapPins.get(command.regionId) ?? null;
  const after = command.pins.length === 0 ? null : command.pins;
  if (JSON.stringify(before) === JSON.stringify(after))
    return reject('NO_EFFECT', 'The map is already so');
  return accept({ type: 'MapPinsSet', payload: { regionId: command.regionId, pins: after } });
}

export function decideSetRoute(
  state: WorldState,
  command: ResolvedCommandOf<'SetRoute'>,
): Decision {
  if (!isPlace(state, command.fromId) || !isPlace(state, command.toId))
    return reject('ENTITY_NOT_FOUND', 'A route joins two places');
  const key = routeKey(command.fromId, command.toId);
  const next = command.route && { fromId: command.fromId, toId: command.toId, ...command.route };
  const before = state.routes.get(key) ?? null;
  if (JSON.stringify(before) === JSON.stringify(next))
    return reject('NO_EFFECT', 'The route is already so');
  return accept({ type: 'RouteSet', payload: { key, route: next } });
}

export function applyTravelEvent(
  state: WorldState,
  event: Extract<RecordedEvent, { type: TravelEventType }>,
): WorldState {
  switch (event.type) {
    case 'MapPinsSet': {
      const { regionId, pins: set } = event.payload;
      if (state.entities.get(regionId)?.kind !== 'location')
        throw new CorruptHistoryError(`a map of ${regionId}, no place`);
      return { ...state, mapPins: put(state.mapPins, regionId, set) };
    }
    case 'RouteSet':
      return { ...state, routes: put(state.routes, event.payload.key, event.payload.route) };
    // A record of the journey: what it changed are the events beside it.
    case 'PartyTravelled':
      return state;
  }
}

const put = <T>(map: ReadonlyMap<string, T>, key: string, value: T | null) =>
  value === null ? withoutEntry(map, key) : withEntry(map, key, value);

export function applyTravelRestore(
  state: WorldState,
  restore: Extract<Restore, { fact: 'mapPins' | 'route' }>,
): WorldState {
  return restore.fact === 'mapPins'
    ? { ...state, mapPins: put(state.mapPins, restore.regionId, restore.value) }
    : { ...state, routes: put(state.routes, restore.key, restore.value) };
}

/** What undo puts back: the pins or the route as they were. */
export function travelRestores(
  event: KernelEventOf<TravelEventType>,
  before: WorldState,
): Restore[] {
  switch (event.type) {
    case 'MapPinsSet': {
      const had = before.mapPins.get(event.payload.regionId);
      return [{ fact: 'mapPins', regionId: event.payload.regionId, value: had ? [...had] : null }];
    }
    case 'RouteSet':
      return [
        {
          fact: 'route',
          key: event.payload.key,
          value: before.routes.get(event.payload.key) ?? null,
        },
      ];
    case 'PartyTravelled':
      return [];
  }
}

export function travelFootprint(event: KernelEventOf<TravelEventType>): Footprint {
  const clock = facts.clock();
  switch (event.type) {
    case 'MapPinsSet': {
      const placed = (event.payload.pins ?? []).flatMap((one) => entityChecked(one.placeId));
      return {
        reads: [clock, ...entityChecked(event.payload.regionId), ...placed],
        writes: [facts.mapPins(event.payload.regionId)],
      };
    }
    case 'RouteSet': {
      const ends = event.payload.route
        ? [...entityChecked(event.payload.route.fromId), ...entityChecked(event.payload.route.toId)]
        : [];
      return { reads: [clock, ...ends], writes: [facts.route(event.payload.key)] };
    }
    case 'PartyTravelled': {
      const { fromId, toId, travellerIds } = event.payload;
      return {
        reads: [clock, facts.route(routeKey(fromId, toId)), ...travellerIds.flatMap(entityChecked)],
        writes: [],
      };
    }
  }
}
