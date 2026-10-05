import type { EntityRef, ScenePresentationResponse } from '@ltw/contracts';
import { StatusPanel } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { SceneImage } from './scene-image.tsx';
import { SceneObjects } from './scene-objects.tsx';

export function Scene({
  api,
  location,
  directory,
  selectedId,
  onSelect,
}: {
  readonly api: WorldApi;
  readonly location: EntityRef;
  readonly directory: readonly EntityRef[];
  readonly selectedId: string | null;
  readonly onSelect: (entityId: string, kind: string) => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<ScenePresentationResponse>(
        `locations/${encodeURIComponent(location.entityId)}/scene`,
        signal,
      ),
    [api, location.entityId],
  );
  const { resource, retry } = useResource(location.entityId, load);
  if (resource.status !== 'ready')
    return (
      <StatusPanel
        state={resource.status}
        label={resource.status === 'error' ? resource.message : 'Loading the scene…'}
        onRetry={retry}
      />
    );
  const scene = resource.value;
  return (
    <div className="exploration-scene">
      {scene.location.image ? (
        <div className="exploration-art" aria-hidden="true">
          <SceneImage api={api} image={scene.location.image} name={location.name} />
        </div>
      ) : null}
      <header className="exploration-heading">
        <div>
          <p className="eyebrow">World view</p>
          <h2>{location.name}</h2>
        </div>
        <div className="exploration-meta" aria-label="Scene conditions">
          <span>{scene.phase}</span>
          {scene.location.weather && <span>{scene.location.weather}</span>}
          <span>World time {scene.worldTime}</span>
        </div>
      </header>
      <div className="exploration-presence">
        <div className="exploration-presence-heading">
          <h3>In this scene</h3>
          <span>{scene.present.length} visible</span>
        </div>
        {!scene.location.observed ? (
          <StatusPanel
            state="empty"
            label="This location is known, but it is not observed in this perspective."
          />
        ) : scene.present.length === 0 ? (
          <StatusPanel state="empty" label="No entities are visible in this scene." />
        ) : (
          <SceneObjects
            present={scene.present}
            directory={directory}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )}
      </div>
      <footer className="exploration-caption">
        <p>Choose a person or object to look closer.</p>
        <span>Symbolic arrangement · no distances shown</span>
      </footer>
    </div>
  );
}
