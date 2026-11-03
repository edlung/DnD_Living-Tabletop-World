import type { WorldMapResponse } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import { MapCanvas } from './map-canvas.tsx';
import { MapEditor } from './map-editor.tsx';
import { TERRAIN_WORDS } from './travel-words.ts';
import { TravelForm } from './travel-form.tsx';

/** What the Places sheet hands the world map. */
export interface WorldMapProps {
  readonly api: WorldApi;
  readonly revision: number;
  readonly isDm: boolean;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}

/**
 * The world map in the Places sheet (docs/adr/0057-encounters-maps-loot.md §10): a region's
 * picture with the places pinned on it, the routes between them in words below, and where the
 * party stands. The DM also pins places and sets routes, and moves the party along a route.
 */
export function WorldMap({
  api,
  revision,
  isDm,
  locked,
  onRun,
  places,
  onPlace,
}: WorldMapProps & {
  /** The places the viewer knows, for the DM's editor. */
  readonly places: readonly { readonly entityId: string; readonly name: string }[];
  readonly onPlace: (placeId: string) => void;
}) {
  const t = useT();
  const ids = useId();
  const load = useCallback(
    (signal: AbortSignal) => api.get<WorldMapResponse>('world-map', signal),
    [api],
  );
  const { resource, reread, retry } = useResource('world-map', load);
  useRereadOn(revision, reread);
  const [chosen, setChosen] = useState<string | null>(null);
  if (resource.status !== 'ready')
    return (
      <StatusPanel
        state={resource.status === 'error' ? 'error' : 'loading'}
        label={resource.status === 'error' ? resource.message : t('Loading the map…')}
        onRetry={retry}
      />
    );
  const map = resource.value;
  const home =
    map.regions.find((one) => one.pins.some((pin) => pin.place.entityId === map.hereId)) ??
    map.regions[0];
  const shown = map.regions.find((one) => one.region.entityId === chosen) ?? home ?? null;
  const pinned = new Set(shown?.pins.map((pin) => pin.place.entityId) ?? []);
  const routes = map.routes.filter(
    (route) => pinned.has(route.from.entityId) || pinned.has(route.to.entityId),
  );
  return (
    <section className="sheet-section world-map" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>
        {shown ? t('Map of {region}', { region: shown.region.name }) : t('Map')}
      </h3>
      {map.regions.length > 1 && shown && (
        <div className="field">
          <label htmlFor={`${ids}-region`}>{t('Region')}</label>
          <select
            id={`${ids}-region`}
            value={shown.region.entityId}
            onChange={(event) => {
              setChosen(event.target.value);
            }}
          >
            {map.regions.map((one) => (
              <option key={one.region.entityId} value={one.region.entityId}>
                {one.region.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {shown ? (
        <MapCanvas
          api={api}
          regionId={shown.region.entityId}
          pins={shown.pins}
          routes={routes}
          hereId={map.hereId}
          onPlace={onPlace}
        />
      ) : (
        <p className="muted">
          {isDm
            ? t('No map yet: choose a place whose picture is the map, and pin places on it.')
            : t('No map of these lands yet.')}
        </p>
      )}
      {routes.length > 0 && (
        <ul className="map-route-list" aria-label={t('Routes')}>
          {routes.map((route) => (
            <li key={`${route.from.entityId}~${route.to.entityId}`}>
              {t('{from} to {to}: {miles} mi, {terrain}', {
                from: route.from.name,
                to: route.to.name,
                miles: route.miles,
                terrain: t(TERRAIN_WORDS[route.terrain]),
              })}
              {route.road && <span className="muted">{` · ${t('a good road')}`}</span>}
            </li>
          ))}
        </ul>
      )}
      {isDm && (
        <>
          <TravelForm map={map} locked={locked} onRun={onRun} />
          <MapEditor
            api={api}
            map={map}
            region={shown?.region.entityId ?? null}
            places={places}
            locked={locked}
            onRun={onRun}
          />
        </>
      )}
    </section>
  );
}
