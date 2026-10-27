import type {
  EntityPresentationResponse,
  PlayerAssetView,
  ScenePresentationResponse,
} from '@ltw/contracts';

import { assetContentFor, entityAssetsFor, sortedViews } from '../assets/views.ts';
import type { RecordedEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import {
  presentableAssets,
  presentationScopeAt,
  presentEntity,
  presentScene,
} from './presentation.ts';
import { visualTimelineAt } from './timeline.ts';

/**
 * Entry points of world visual state (docs/adr/0023-world-visual-state.md):
 * an entity or a place as a perspective saw it at a world time (default:
 * now), the pictures of an entity it may list now, and whether that
 * perspective may fetch an image's bytes for that time. Null means not visible, exactly as for something that does not
 * exist. Throws `RangeError` for a time after the world clock.
 */
export interface Snapshot {
  readonly state: WorldState;
  readonly history: readonly RecordedEvent[];
}

const timelineOf = (snapshot: Snapshot, worldTime: number | null) =>
  visualTimelineAt(snapshot.history, worldTime ?? snapshot.state.clock, snapshot.state);

export function entityPresentationAt(
  snapshot: Snapshot,
  perspective: ResolvedPerspective,
  entityId: string,
  worldTime: number | null,
): EntityPresentationResponse | null {
  const timeline = timelineOf(snapshot, worldTime);
  const presentation = presentEntity(
    timeline,
    presentationScopeAt(timeline, perspective),
    entityId,
  );
  return presentation
    ? {
        perspective: perspective.label,
        worldTime: timeline.worldTime,
        phase: timeline.phase,
        presentation,
      }
    : null;
}

export function scenePresentationAt(
  snapshot: Snapshot,
  perspective: ResolvedPerspective,
  locationId: string,
  worldTime: number | null,
): ScenePresentationResponse | null {
  const timeline = timelineOf(snapshot, worldTime);
  const scene = presentScene(timeline, presentationScopeAt(timeline, perspective), locationId);
  return scene
    ? {
        perspective: perspective.label,
        worldTime: timeline.worldTime,
        phase: timeline.phase,
        ...scene,
      }
    : null;
}

/**
 * An entity's pictures as the perspective may list them now (Gate 06, G06-images-01): the DM, every
 * approved one; anyone else, only what presentation could choose for it now (`presentableAssets`).
 * Null when the entity is not visible, as for one that does not exist.
 */
export function entityAssetsAt(
  snapshot: Snapshot,
  perspective: ResolvedPerspective,
  entityId: string,
): PlayerAssetView[] | null {
  if (perspective.scopes === 'ALL') return entityAssetsFor(snapshot.state, perspective, entityId);
  const timeline = timelineOf(snapshot, null);
  const assets = presentableAssets(timeline, presentationScopeAt(timeline, perspective), entityId);
  return assets && sortedViews(assets);
}

/**
 * Image bytes a perspective may fetch for a view at that time (default now): the DM, any asset's;
 * anyone else, only a picture presentation could choose for it then (Gate 06, G06-images-01), so
 * a state picture of an entity not seen in that state is a 404 like a nonexistent hash.
 */
export function assetContentAt(
  snapshot: Snapshot,
  perspective: ResolvedPerspective,
  contentHash: string,
  worldTime: number | null,
): Pick<PlayerAssetView, 'mediaType'> | null {
  if (perspective.scopes === 'ALL')
    return assetContentFor(snapshot.state, perspective, contentHash);
  const timeline = timelineOf(snapshot, worldTime);
  const scope = presentationScopeAt(timeline, perspective);
  const checked = new Set<string>();
  for (const asset of snapshot.state.assets.assets.values()) {
    if (asset.contentHash !== contentHash || checked.has(asset.entityId)) continue;
    checked.add(asset.entityId);
    const presentable = presentableAssets(timeline, scope, asset.entityId) ?? [];
    const shown = presentable.find((candidate) => candidate.contentHash === contentHash);
    if (shown) return { mediaType: shown.mediaType };
  }
  return null;
}
