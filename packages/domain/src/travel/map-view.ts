import type { WorldMapResponse } from '@ltw/contracts';

import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import { entityRef, knownEntityIds } from '../knowledge/projection.ts';

/**
 * The world map as a perspective sees it (docs/adr/0057-encounters-maps-loot.md §10): each region
 * it knows with the places it knows pinned, the routes between two places it knows, and where it
 * stands — a character where it is; the DM and the party where most characters are.
 */
export function worldMapView(
  state: WorldState,
  perspective: ResolvedPerspective,
): Omit<WorldMapResponse, 'perspective'> {
  const known = knownEntityIds(state, perspective);
  const regions = [...state.mapPins]
    .filter(([regionId]) => known.has(regionId))
    .map(([regionId, pins]) => ({
      region: entityRef(state, regionId),
      pins: pins
        .filter((pin) => known.has(pin.placeId))
        .map((pin) => ({ place: entityRef(state, pin.placeId), x: pin.x, y: pin.y })),
    }));
  const routes = [...state.routes.values()]
    .filter((route) => known.has(route.fromId) && known.has(route.toId))
    .map((route) => ({
      from: entityRef(state, route.fromId),
      to: entityRef(state, route.toId),
      miles: route.miles,
      terrain: route.terrain,
      road: route.road,
    }));
  const hereId = hereOf(state, perspective, known);
  const party = [...state.entities.values()]
    .filter(
      (entity) =>
        entity.kind === 'character' &&
        entity.status === 'active' &&
        known.has(entity.entityId) &&
        hereId !== null &&
        entity.placement?.locationId === hereId,
    )
    .map((entity) => entityRef(state, entity.entityId));
  return { regions, routes, hereId, party };
}

function hereOf(
  state: WorldState,
  perspective: ResolvedPerspective,
  known: ReadonlySet<string>,
): string | null {
  if (perspective.kind === 'CHARACTER') {
    const holder = perspective.holderId === null ? null : state.entities.get(perspective.holderId);
    const here = holder?.placement?.locationId ?? null;
    return here !== null && known.has(here) ? here : null;
  }
  const counts = new Map<string, number>();
  for (const entity of state.entities.values()) {
    const here = entity.placement?.locationId;
    if (entity.kind !== 'character' || entity.status !== 'active' || here === undefined) continue;
    if (!known.has(entity.entityId) || !known.has(here)) continue;
    counts.set(here, (counts.get(here) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [place, count] of counts)
    if (best === null || count > (counts.get(best) ?? 0)) best = place;
  return best;
}
