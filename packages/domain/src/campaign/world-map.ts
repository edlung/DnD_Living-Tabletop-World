import { routeKey, type CampaignEntity } from '@ltw/contracts';

import { entityReference, error, type PlanContext } from './context.ts';

/**
 * The package's world map (docs/adr/0057-encounters-maps-loot.md §10, ADR 0058 notes of
 * 2026-11-17): each map is an active place's, pinning active places once each; each route joins two
 * different active places, one route a pair whichever way it is written. The compiler refuses what
 * the World Engine's `SetMapPins` and `SetRoute` would refuse, so a ready package never fails on
 * activation.
 */
export function validateWorldMap(context: PlanContext): void {
  const regions = new Set<string>();
  for (const [index, map] of (context.content.maps ?? []).entries()) {
    const path = `maps.${String(index)}`;
    activePlace(context, map.region, `${path}.region`);
    if (regions.has(map.region))
      error(context, 'MAP_DUPLICATE', `${path}.region`, 'A place has one map');
    regions.add(map.region);
    const pinned = new Set<string>();
    for (const [at, pin] of map.pins.entries()) {
      const pinPath = `${path}.pins.${String(at)}.place`;
      activePlace(context, pin.place, pinPath);
      if (pinned.has(pin.place)) error(context, 'PIN_DUPLICATE', pinPath, 'A place is pinned once');
      pinned.add(pin.place);
    }
  }
  const pairs = new Set<string>();
  for (const [index, route] of (context.content.routes ?? []).entries()) {
    const path = `routes.${String(index)}`;
    activePlace(context, route.from, `${path}.from`);
    activePlace(context, route.to, `${path}.to`);
    if (route.from === route.to)
      error(context, 'ROUTE_SELF', `${path}.to`, 'A route joins two different places');
    const key = routeKey(route.from, route.to);
    if (pairs.has(key))
      error(context, 'ROUTE_DUPLICATE', path, 'Two places are joined by one route');
    pairs.add(key);
  }
}

function activePlace(context: PlanContext, key: string, path: string): CampaignEntity | undefined {
  const place = entityReference(context, key, path, ['location']);
  if (place && place.status !== 'active')
    error(context, 'PLACE_INACTIVE', path, 'A map shows only active places');
  return place;
}
