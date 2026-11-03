import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import type { EntityRef } from '../knowledge/views.ts';

/**
 * The world map and travel (docs/adr/0057-encounters-maps-loot.md §10; SRD 5.2.1 "Travel Pace",
 * Gameplay Toolbox "Travel Pace", "Travel Terrain"). A region — a place whose picture is its map —
 * carries pins: the places it shows, where on the picture. Routes join two places with their miles,
 * the predominant terrain and whether a good road runs. The DM moves the party along a route at a
 * pace; the World Engine advances the clock by the hours it takes, places the travellers and asks
 * the Constitution saves of extended travel. Shapes only.
 */
export const TRAVEL_PACES = ['slow', 'normal', 'fast'] as const;
export type TravelPace = (typeof TRAVEL_PACES)[number];

/** Miles an hour at each pace (SRD 5.2.1 Travel Pace table). */
export const PACE_MILES_PER_HOUR: Readonly<Record<TravelPace, number>> = {
  fast: 4,
  normal: 3,
  slow: 2,
};

/** Land terrains and the most a group's pace may be in each (SRD 5.2.1 Travel Terrain). */
export const TRAVEL_TERRAINS = [
  'arctic',
  'coastal',
  'desert',
  'forest',
  'grassland',
  'hill',
  'mountain',
  'swamp',
  'underdark',
  'urban',
] as const;
export type TravelTerrain = (typeof TRAVEL_TERRAINS)[number];

export const TERRAIN_MAX_PACE: Readonly<Record<TravelTerrain, TravelPace>> = {
  // Fast only with the right equipment (skis); the DM says so by choosing it.
  arctic: 'fast',
  coastal: 'normal',
  desert: 'normal',
  forest: 'normal',
  grassland: 'fast',
  hill: 'normal',
  mountain: 'slow',
  swamp: 'slow',
  underdark: 'normal',
  urban: 'normal',
};

/** Hours of a day's travel before it is extended travel (SRD 5.2.1). */
export const TRAVEL_DAY_HOURS = 8;
export const MAX_ROUTE_MILES = 1_000;
export const MAX_MAP_PINS = 60;

/**
 * The fastest pace a group may take on a route: the terrain's, one step more on a good road, and
 * Slow when a traveller's Speed is down to half or less (SRD 5.2.1 Gameplay Toolbox).
 */
export function maxTravelPace(terrain: TravelTerrain, road: boolean, slowed: boolean): TravelPace {
  if (slowed) return 'slow';
  const step = TRAVEL_PACES.indexOf(TERRAIN_MAX_PACE[terrain]) + (road ? 1 : 0);
  return TRAVEL_PACES[Math.min(step, TRAVEL_PACES.length - 1)] ?? 'slow';
}

/** A route's key: its two places in order, so a pair has one route whichever way it is read. */
export const routeKey = (a: string, b: string): string => (a < b ? `${a}~${b}` : `${b}~${a}`);

const pinSchema = z
  .object({
    placeId: entityIdSchema,
    /** Where on the region's picture, as fractions of its width and height. */
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })
  .strict();

/** The DM's pins of a region's map, all of them at once; none clears the map. */
export const setMapPinsCommandSchema = z
  .object({
    type: z.literal('SetMapPins'),
    regionId: entityIdSchema,
    pins: z
      .array(pinSchema)
      .max(MAX_MAP_PINS)
      .refine(
        (pins) => new Set(pins.map((pin) => pin.placeId)).size === pins.length,
        'A place is pinned once',
      ),
  })
  .strict();

/** A route between two places set, or removed (null). */
export const setRouteCommandSchema = z
  .object({
    type: z.literal('SetRoute'),
    fromId: entityIdSchema,
    toId: entityIdSchema,
    route: z
      .object({
        miles: z.number().int().min(1).max(MAX_ROUTE_MILES),
        terrain: z.enum(TRAVEL_TERRAINS),
        road: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((command) => command.fromId !== command.toId, 'A route joins two places');

/** The DM moves travellers along a route at a pace, so many hours a day. */
export const travelCommandSchema = z
  .object({
    type: z.literal('Travel'),
    toId: entityIdSchema,
    pace: z.enum(TRAVEL_PACES),
    hoursPerDay: z.number().int().min(1).max(16).default(TRAVEL_DAY_HOURS),
    travellerIds: z
      .array(entityIdSchema)
      .min(1)
      .max(12)
      .refine((ids) => new Set(ids).size === ids.length, 'A traveller is named once'),
  })
  .strict();

export interface MapPinView {
  readonly place: EntityRef;
  readonly x: number;
  readonly y: number;
}

export interface RouteView {
  readonly from: EntityRef;
  readonly to: EntityRef;
  readonly miles: number;
  readonly terrain: TravelTerrain;
  readonly road: boolean;
}

/** A region's map as a viewer sees it: the places it knows pinned, the routes between them. */
export interface WorldMapResponse {
  readonly perspective: string;
  /** The regions with a map the viewer knows; the one shown first is the viewed place's. */
  readonly regions: readonly {
    readonly region: EntityRef;
    readonly pins: readonly MapPinView[];
  }[];
  readonly routes: readonly RouteView[];
  /** Where the viewer's party stands (the DM: where most characters are). */
  readonly hereId: string | null;
  /** The characters standing there that the viewer knows: who may set out together. */
  readonly party: readonly EntityRef[];
}
