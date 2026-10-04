import type {
  EntityPresentationResponse,
  PlayerAssetView,
  ScenePresentationResponse,
} from '@ltw/contracts';

import { assetContentFor } from '../assets/views.ts';
import type { RecordedEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import { presentationScopeAt, presentEntity, presentScene } from './presentation.ts';
import { visualTimelineAt } from './timeline.ts';

/**
 * Entry points of world visual state (docs/adr/0023-world-visual-state.md):
 * an entity or a place as a perspective saw it at a world time (default:
 * now), and whether that perspective may fetch an image's bytes for that
 * time. Null means not visible, exactly as for something that does not
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

/** Image bytes a perspective may fetch for a view at that time: what it may see then. */
export function assetContentAt(
  snapshot: Snapshot,
  perspective: ResolvedPerspective,
  contentHash: string,
  worldTime: number,
): Pick<PlayerAssetView, 'mediaType'> | null {
  const timeline = timelineOf(snapshot, worldTime);
  const { visible } = presentationScopeAt(timeline, perspective);
  return assetContentFor(snapshot.state, perspective, contentHash, visible);
}
