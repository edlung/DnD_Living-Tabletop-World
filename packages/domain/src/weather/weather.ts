import { WEATHERS, entityIdSchema } from '@ltw/contracts';
import { z } from 'zod';

import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import { findUsableLocation } from '../kernel/decide/lookups.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { RecordedEvent, Restore } from '../kernel/events.ts';
import { withEntry, withoutEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';

/**
 * Weather (docs/adr/0023-world-visual-state.md §1; owner decision of
 * 2026-10-04): a world fact the DM sets for a location from the current
 * world time on. Child locations inherit it. Undo restores the weather
 * before; a later change of the same location blocks it, as any writer.
 */
const weather = z.enum(WEATHERS);

export const weatherSetPayloadSchema = z
  .object({ locationId: entityIdSchema, from: weather.nullable(), to: weather })
  .strict();

/** The location's own weather before the undone change; null when it had none. */
export const weatherRestoreSchemas = [
  z
    .object({ fact: z.literal('weather'), locationId: entityIdSchema, value: weather.nullable() })
    .strict(),
] as const;

export function decideSetWeather(
  state: WorldState,
  command: ResolvedCommandOf<'SetWeather'>,
): Decision {
  const location = findUsableLocation(state, command.locationId);
  if (!location.ok) return location;
  const from = state.weather.get(command.locationId) ?? null;
  if (from === command.weather) {
    return reject('INVALID_WEATHER', `The weather there is already ${command.weather}`);
  }
  return accept({
    type: 'WeatherSet',
    payload: { locationId: command.locationId, from, to: command.weather },
  });
}

export function applyWeatherSet(
  state: WorldState,
  event: Extract<RecordedEvent, { type: 'WeatherSet' }>,
): WorldState {
  const { locationId, from, to } = event.payload;
  if (state.entities.get(locationId)?.kind !== 'location') {
    throw new CorruptHistoryError(`weather of unknown location ${locationId}`);
  }
  if ((state.weather.get(locationId) ?? null) !== from) {
    throw new CorruptHistoryError(`weather of ${locationId} was not ${String(from)}`);
  }
  return { ...state, weather: withEntry(state.weather, locationId, to) };
}

export function applyWeatherRestore(
  state: WorldState,
  restore: Extract<Restore, { fact: 'weather' }>,
): WorldState {
  return {
    ...state,
    weather:
      restore.value === null
        ? withoutEntry(state.weather, restore.locationId)
        : withEntry(state.weather, restore.locationId, restore.value),
  };
}
