import type { EntityPresentation, PlayerAssetView } from '@ltw/contracts';

import { SHOWN_ASSET, type AssetRecord } from '../assets/records.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import { knownEntityIds } from '../knowledge/projection.ts';
import { INDOOR_LOCATION_TYPES, type VisualTimeline } from './timeline.ts';

/**
 * How things looked to a perspective at world time T (docs/adr/0023-world-
 * visual-state.md §3–4; owner decisions of 2026-10-04):
 *
 * - **Visible:** what the perspective knows now, or perceived at T (where
 *   its holder, or for the party any member, stood then). Anything else,
 *   or anything that did not exist at T, is null: a 404 like nothing.
 * - **Observed:** perceived at T. Only then are status, vitals, conditions,
 *   equipment, and weather shown; knowing of something says nothing of how
 *   it was.
 * - **Image:** the entity's current approved images. A derived variant is
 *   chosen when every part of its label is among the tags the perspective
 *   may see; otherwise the canonical reference.
 */
export interface PresentationScope {
  readonly perspective: ResolvedPerspective;
  readonly visible: ReadonlySet<string> | 'ALL';
  readonly observed: ReadonlySet<string> | 'ALL';
}

/** What a perceiver standing somewhere at T perceives, as `perceivedEntityIds` does now. */
function perceivedAt(timeline: VisualTimeline, perceiverId: string): Set<string> {
  const { view, current } = timeline;
  const perceived = new Set<string>();
  if (!view.entities.has(perceiverId)) return perceived;
  perceived.add(perceiverId);
  const here = view.entities.get(perceiverId)?.locationId ?? null;
  if (here === null || !view.entities.has(here)) return perceived;
  perceived.add(here);
  const parentId = current.entities.get(here)?.location?.parentId ?? null;
  if (parentId !== null && view.entities.has(parentId)) perceived.add(parentId);
  for (const entity of view.entities.values()) {
    if (entity.locationId === here) perceived.add(entity.entityId);
    if (entity.kind === 'location' && entity.location?.parentId === here) {
      perceived.add(entity.entityId);
    }
  }
  return perceived;
}

export function presentationScopeAt(
  timeline: VisualTimeline,
  perspective: ResolvedPerspective,
): PresentationScope {
  if (perspective.scopes === 'ALL') return { perspective, visible: 'ALL', observed: 'ALL' };
  const { view, current } = timeline;
  const perceivers =
    perspective.kind === 'PARTY'
      ? [...current.roster.keys()]
      : perspective.holderId === null
        ? []
        : [perspective.holderId];
  const observed = new Set<string>();
  for (const perceiver of perceivers) {
    for (const entityId of perceivedAt(timeline, perceiver)) observed.add(entityId);
  }
  const visible = new Set(observed);
  for (const entityId of knownEntityIds(current, perspective)) {
    if (view.entities.has(entityId)) visible.add(entityId);
  }
  return { perspective, visible, observed };
}

const has = (set: ReadonlySet<string> | 'ALL', id: string) => set === 'ALL' || set.has(id);

const assetView = ({ variant, version, contentHash, mediaType }: AssetRecord): PlayerAssetView => ({
  variant,
  version,
  contentHash,
  mediaType,
});

/** The current approved image that fits the tags best: a matching variant, else the reference. */
export function imageFor(
  timeline: VisualTimeline,
  scope: PresentationScope,
  entityId: string,
  tags: readonly string[],
): PlayerAssetView | null {
  const shown = [...timeline.current.assets.assets.values()].filter(
    (asset) =>
      asset.entityId === entityId &&
      SHOWN_ASSET.has(asset.status) &&
      (scope.perspective.scopes === 'ALL' || asset.audience === 'players'),
  );
  const fitting = shown
    .filter((asset) => asset.variant === 'derived' && asset.label !== null)
    .map((asset) => ({ asset, parts: (asset.label ?? '').split('-') }))
    .filter(({ parts }) => parts.every((part) => tags.includes(part)))
    .sort(
      (a, b) =>
        b.parts.length - a.parts.length ||
        b.asset.version - a.asset.version ||
        (a.asset.label ?? '').localeCompare(b.asset.label ?? ''),
    );
  const chosen = fitting[0]?.asset ?? shown.find((asset) => asset.status === 'CANONICAL');
  return chosen ? assetView(chosen) : null;
}

export function presentEntity(
  timeline: VisualTimeline,
  scope: PresentationScope,
  entityId: string,
): EntityPresentation | null {
  const at = timeline.view.entities.get(entityId);
  if (!at || !has(scope.visible, entityId)) return null;
  const observed = has(scope.observed, entityId);
  const active = at.status === 'active';
  const held = observed && active ? timeline.vitals.get(entityId) : undefined;
  const vitals = held
    ? {
        wounded: held.hitPoints.current > 0 && held.hitPoints.current * 2 <= held.hitPoints.max,
        unconscious: held.hitPoints.current === 0 || held.conditions.includes('unconscious'),
      }
    : null;
  let weather = null;
  if (observed) {
    const placeId = at.kind === 'location' ? entityId : at.locationId;
    const place = placeId === null ? undefined : timeline.current.entities.get(placeId);
    const indoors =
      at.kind !== 'location' &&
      place?.location !== null &&
      place?.location !== undefined &&
      INDOOR_LOCATION_TYPES.has(place.location.type);
    weather = placeId === null || indoors ? null : timeline.weatherOf(placeId);
  }
  const conditions = held ? [...held.conditions] : [];
  const tags = [
    ...new Set([
      timeline.phase,
      ...(weather === null ? [] : [weather]),
      ...(observed && !active ? [at.status] : []),
      ...(vitals?.unconscious ? ['unconscious'] : vitals?.wounded ? ['wounded'] : []),
      ...conditions,
    ]),
  ];
  return {
    entityId,
    kind: at.kind,
    observed,
    status: observed ? at.status : null,
    vitals,
    conditions,
    equipment: held ? [...held.equipment] : [],
    weather,
    tags,
    image: imageFor(timeline, scope, entityId, tags),
  };
}

/** A place at T and what the perspective perceived there then. Null when not visible. */
export function presentScene(
  timeline: VisualTimeline,
  scope: PresentationScope,
  locationId: string,
): { location: EntityPresentation; present: EntityPresentation[] } | null {
  if (timeline.view.entities.get(locationId)?.kind !== 'location') return null;
  const location = presentEntity(timeline, scope, locationId);
  if (!location) return null;
  const present = location.observed
    ? [...timeline.view.entities.values()]
        // Only what was perceived there: knowing someone never says where they were.
        .filter(
          (entity) => entity.locationId === locationId && has(scope.observed, entity.entityId),
        )
        .map((entity) => presentEntity(timeline, scope, entity.entityId))
        .filter((entity): entity is EntityPresentation => entity !== null)
        .sort((a, b) => a.entityId.localeCompare(b.entityId))
    : [];
  return { location, present };
}
