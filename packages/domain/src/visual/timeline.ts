import type { Condition, DayPhase, LocationType, Weather } from '@ltw/contracts';

import type { RecordedEvent } from '../kernel/events.ts';
import { replay } from '../kernel/evolve.ts';
import { effectiveEvents, worldViewAt, type WorldView } from '../kernel/projections/world-view.ts';
import type { WorldState } from '../kernel/state.ts';

/**
 * The world's visual facts at a world time T, under the current canon
 * (docs/adr/0023-world-visual-state.md §2; ADR 0006 §2–3): what existed and
 * where (`worldViewAt`), the weather each location had, and each creature's
 * hit points, conditions, and equipment. Only effective events count, by
 * their world time; undone commands never show.
 */
export interface Vitals {
  readonly hitPoints: { readonly current: number; readonly max: number };
  readonly conditions: readonly Condition[];
  readonly equipment: readonly string[];
}

export interface VisualTimeline {
  readonly worldTime: number;
  readonly phase: DayPhase;
  readonly view: WorldView;
  /** The canonical state now: identity, location nesting, images, knowledge. */
  readonly current: WorldState;
  /** A location's weather at T: its own, or its nearest ancestor's; null when none was set. */
  readonly weatherOf: (locationId: string) => Weather | null;
  readonly vitals: ReadonlyMap<string, Vitals>;
}

const DAY = 86_400;
const HOUR = 3_600;

/** Night until 05:00, dawn until 07:00, day until 18:00, dusk until 20:00, then night. */
export function dayPhaseAt(worldTime: number): DayPhase {
  const hour = Math.floor((((worldTime % DAY) + DAY) % DAY) / HOUR);
  if (hour < 5) return 'night';
  if (hour < 7) return 'dawn';
  if (hour < 18) return 'day';
  if (hour < 20) return 'dusk';
  return 'night';
}

/** Interiors: weather does not fall on what is inside them. */
export const INDOOR_LOCATION_TYPES: ReadonlySet<LocationType> = new Set(['building', 'room']);

export function visualTimelineAt(
  history: readonly RecordedEvent[],
  worldTime: number,
  current: WorldState = replay(history),
): VisualTimeline {
  const view = worldViewAt(history, worldTime, current);
  const own = new Map<string, Weather>();
  const vitals = new Map<string, Vitals>();
  const withVitals = (entityId: string, change: (before: Vitals) => Vitals) => {
    const before = vitals.get(entityId);
    if (before) vitals.set(entityId, change(before));
  };
  for (const event of effectiveEvents(history, current)) {
    if (event.worldTime > worldTime) continue;
    switch (event.type) {
      case 'WeatherSet':
        own.set(event.payload.locationId, event.payload.to);
        break;
      case 'CharacterSheetSet': {
        const { hitPoints, conditions, weapons } = event.payload.sheet;
        vitals.set(event.payload.entityId, { hitPoints, conditions, equipment: weapons });
        break;
      }
      case 'StatBlockSet': {
        const { hitPoints, conditions, attacks } = event.payload.statBlock;
        const equipment = attacks.map((attack) => attack.attackId);
        vitals.set(event.payload.entityId, { hitPoints, conditions, equipment });
        break;
      }
      case 'DamageApplied':
      case 'HealingApplied':
      case 'HitPointsAdjusted': {
        const { hpAfter } = event.payload;
        withVitals(event.payload.targetId, (before) => ({
          ...before,
          hitPoints: { ...before.hitPoints, current: hpAfter },
        }));
        break;
      }
      case 'ConditionApplied': {
        const { condition, applied } = event.payload;
        withVitals(event.payload.targetId, (before) => ({
          ...before,
          conditions: applied
            ? [...new Set([...before.conditions, condition])]
            : before.conditions.filter((held) => held !== condition),
        }));
        break;
      }
      default:
        break;
    }
  }
  const weatherOf = (locationId: string): Weather | null => {
    const seen = new Set<string>();
    for (let id: string | null = locationId; id !== null && !seen.has(id);) {
      seen.add(id);
      const set = own.get(id);
      if (set) return set;
      id = current.entities.get(id)?.location?.parentId ?? null;
    }
    return null;
  };
  return { worldTime, phase: dayPhaseAt(worldTime), view, current, weatherOf, vitals };
}
