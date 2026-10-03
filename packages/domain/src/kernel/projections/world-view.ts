import type { EntityKind, EntityStatus } from '@ltw/contracts';

import type { RecordedEvent } from '../events.ts';
import { replay } from '../evolve.ts';
import type { LocationInfo } from '../state.ts';
import { isAtOrAfter } from '../world-time.ts';

/**
 * The world timeline under the current canon (ADR 0006 §2–3): what was true
 * at world time T, considering only effective events (undone commands and
 * their compensations are excluded). In-world facts (placement, status,
 * scenes) use their world times; profile edits are timeless corrections.
 * Canonical/DM view; perspective filtering arrives with Stage 20.
 */
export interface EntityAtTime {
  readonly entityId: string;
  readonly kind: EntityKind;
  readonly name: string;
  readonly description: string;
  readonly location: LocationInfo | null;
  /** Location at that time, or null if unplaced/unknown. */
  readonly locationId: string | null;
  readonly status: EntityStatus;
}

export interface SceneAtTime {
  readonly sceneId: string;
  readonly title: string;
  readonly locationId: string;
}

export interface WorldView {
  readonly worldTime: number;
  readonly entities: ReadonlyMap<string, EntityAtTime>;
  readonly scenes: readonly SceneAtTime[];
}

interface Timeline {
  readonly placements: { readonly since: number | null; readonly locationId: string }[];
  readonly statuses: { readonly at: number; readonly status: EntityStatus }[];
}

export function worldViewAt(history: readonly RecordedEvent[], worldTime: number): WorldView {
  const current = replay(history);
  if (worldTime > current.clock) {
    throw new RangeError('The world timeline is only known up to the current world clock');
  }

  const effective = history.filter(
    (event) =>
      event.type !== 'CommandUndone' &&
      (current.commands.get(event.causation.commandId)?.undoneBy ?? null) === null,
  );
  const timelines = new Map<string, Timeline>();
  const timeline = (entityId: string): Timeline => {
    let found = timelines.get(entityId);
    if (!found) {
      found = { placements: [], statuses: [] };
      timelines.set(entityId, found);
    }
    return found;
  };
  for (const event of effective) {
    if (event.type === 'EntityPlaced') {
      timeline(event.payload.entityId).placements.push({
        since: event.payload.since,
        locationId: event.payload.locationId,
      });
    } else if (event.type === 'EntityStatusChanged') {
      timeline(event.payload.entityId).statuses.push({
        at: event.worldTime,
        status: event.payload.to,
      });
    }
  }

  const entities = new Map<string, EntityAtTime>();
  for (const entity of current.entities.values()) {
    if (!isAtOrAfter(worldTime, entity.existsSince)) continue;
    const { placements, statuses } = timeline(entity.entityId);
    const placement = placements.findLast((entry) => isAtOrAfter(worldTime, entry.since));
    const status = statuses.findLast((entry) => entry.at <= worldTime);
    entities.set(entity.entityId, {
      entityId: entity.entityId,
      kind: entity.kind,
      name: entity.name,
      description: entity.description,
      location: entity.location,
      locationId: placement?.locationId ?? null,
      status: status?.status ?? 'active',
    });
  }

  const scenes = [...current.scenes.values()]
    .filter(
      (scene) =>
        scene.startedAt <= worldTime && (scene.endedAt === null || scene.endedAt > worldTime),
    )
    .map(({ sceneId, title, locationId }) => ({ sceneId, title, locationId }));

  return { worldTime, entities, scenes };
}
