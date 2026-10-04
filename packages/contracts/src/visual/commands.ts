import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * Weather and day phases (docs/adr/0023-world-visual-state.md). Weather is a
 * world fact the DM sets for a location from the current world time on;
 * child locations inherit it. Day phases follow from the world clock.
 */
export const WEATHERS = ['clear', 'overcast', 'rain', 'storm', 'fog', 'snow'] as const;
export type Weather = (typeof WEATHERS)[number];

export const DAY_PHASES = ['night', 'dawn', 'day', 'dusk'] as const;
export type DayPhase = (typeof DAY_PHASES)[number];

export const setWeatherCommandSchema = z
  .object({
    type: z.literal('SetWeather'),
    locationId: entityIdSchema,
    weather: z.enum(WEATHERS),
  })
  .strict();
