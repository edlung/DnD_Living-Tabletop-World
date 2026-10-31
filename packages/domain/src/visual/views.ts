import type {
  AssetMediaType,
  EntityPresentationResponse,
  PlayerAssetView,
  ScenePresentationResponse,
} from '@ltw/contracts';

import { SHOWN_ASSET } from '../assets/records.ts';
import { dmAssetContent, dmEntityAssets, sortedViews } from '../assets/views.ts';
import type { RecordedEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import { projectionPartyMemberIds } from '../knowledge/projection-party.ts';
import {
  presentableAssets,
  presentationScopeAt,
  presentEntity,
  presentScene,
} from './presentation.ts';
import { remembered } from './memo.ts';
import { visualTimelineAt, type VisualTimeline } from './timeline.ts';

/**
 * Entry points of world visual state (docs/adr/0023-world-visual-state.md):
 * an entity or a place as a perspective saw it at a world time (default:
 * now), the pictures of an entity it may list now, and whether that
 * perspective may fetch an image's bytes for that time. Null means not
 * visible, exactly as for something that does not exist. Throws `RangeError`
 * for a time after the world clock. Timelines and a perspective's servable
 * pictures are remembered per history version (`memo.ts`), bounded.
 */
export interface Snapshot {
  readonly state: WorldState;
  readonly history: readonly RecordedEvent[];
}

/** The visual timeline at a time (default now), built once per history version and time. */
export function timelineOf(snapshot: Snapshot, worldTime: number | null): VisualTimeline {
  const at = worldTime ?? snapshot.state.clock;
  return remembered(snapshot.history, `timeline|${String(at)}`, () =>
    visualTimelineAt(snapshot.history, at, snapshot.state),
  );
}

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
  if (perspective.scopes === 'ALL') return dmEntityAssets(snapshot.state, entityId);
  const timeline = timelineOf(snapshot, null);
  const assets = presentableAssets(timeline, presentationScopeAt(timeline, perspective), entityId);
  return assets && sortedViews(assets);
}

/**
 * Every picture's bytes a perspective other than the DM may fetch for a view at that time
 * (default now): what presentation could choose for it then, of every entity, by content hash.
 * Remembered per history version, perspective and time, so a scene's pictures cost one replay.
 */
export function presentableContent(
  snapshot: Snapshot,
  perspective: ResolvedPerspective,
  worldTime: number | null,
): ReadonlyMap<string, AssetMediaType> {
  const at = worldTime ?? snapshot.state.clock;
  // Within one history the label decides the scopes; they are part of the key all the same.
  const scopes = perspective.scopes === 'ALL' ? 'ALL' : [...perspective.scopes].sort().join(',');
  const party = [...projectionPartyMemberIds(snapshot.state, perspective)].sort().join(',');
  return remembered(
    snapshot.history,
    `content|${String(at)}|${perspective.label}|${scopes}|${party}`,
    () => {
      const timeline = timelineOf(snapshot, at);
      const scope = presentationScopeAt(timeline, perspective);
      const entities = new Set<string>();
      for (const asset of snapshot.state.assets.assets.values()) {
        if (SHOWN_ASSET.has(asset.status) && asset.audience === 'players') {
          entities.add(asset.entityId);
        }
      }
      const content = new Map<string, AssetMediaType>();
      for (const entityId of entities) {
        for (const asset of presentableAssets(timeline, scope, entityId) ?? []) {
          content.set(asset.contentHash, asset.mediaType);
        }
      }
      return content;
    },
  );
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
  if (perspective.scopes === 'ALL') return dmAssetContent(snapshot.state, contentHash);
  const mediaType = presentableContent(snapshot, perspective, worldTime).get(contentHash);
  return mediaType === undefined ? null : { mediaType };
}
