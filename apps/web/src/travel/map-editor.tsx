import {
  MAX_ROUTE_MILES,
  TRAVEL_TERRAINS,
  type TravelTerrain,
  type WorldMapResponse,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Opening } from '../shell/opening.tsx';
import { MapCanvas } from './map-canvas.tsx';
import { TERRAIN_WORDS } from './travel-words.ts';

interface Place {
  readonly entityId: string;
  readonly name: string;
}

/**
 * The DM's hand on the world map (docs/adr/0057-encounters-maps-loot.md §10): which place's picture
 * is the map, and where on it each place is pinned — clicked on the map, or set by its X and Y — and
 * the routes between places, each with its miles, terrain and whether a good road runs.
 */
export function MapEditor({
  api,
  map,
  region,
  places,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly map: WorldMapResponse;
  readonly region: string | null;
  readonly places: readonly Place[];
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const ids = useId();
  const [regionId, setRegionId] = useState(region ?? places[0]?.entityId ?? '');
  const saved = map.regions.find((one) => one.region.entityId === regionId)?.pins ?? [];
  const [draft, setDraft] = useState<
    readonly { readonly placeId: string; readonly x: number; readonly y: number }[] | null
  >(null);
  const pins = draft ?? saved.map((pin) => ({ placeId: pin.place.entityId, x: pin.x, y: pin.y }));
  const [placing, setPlacing] = useState(places[0]?.entityId ?? '');
  const nameOf = (id: string) => places.find((one) => one.entityId === id)?.name ?? id;
  const pinned = pins.find((pin) => pin.placeId === placing);
  const put = (x: number, y: number) => {
    setDraft([...pins.filter((pin) => pin.placeId !== placing), { placeId: placing, x, y }]);
  };
  const percent = (value: number) => Math.round(value * 100);
  return (
    <Opening className="map-editor" summary={t('Edit the map')}>
      <div className="hand-form">
        <div className="account-field">
          <label htmlFor={`${ids}-region`}>{t('The map is the picture of')}</label>
          <select
            id={`${ids}-region`}
            value={regionId}
            onChange={(event) => {
              setRegionId(event.target.value);
              setDraft(null);
            }}
          >
            {places.map((one) => (
              <option key={one.entityId} value={one.entityId}>
                {one.name}
              </option>
            ))}
          </select>
        </div>
        <div className="hand-row map-pin-row">
          <div className="account-field">
            <label htmlFor={`${ids}-place`}>{t('Place to pin')}</label>
            <select
              id={`${ids}-place`}
              value={placing}
              onChange={(event) => {
                setPlacing(event.target.value);
              }}
            >
              {places.map((one) => (
                <option key={one.entityId} value={one.entityId}>
                  {one.name}
                </option>
              ))}
            </select>
          </div>
          {(['x', 'y'] as const).map((axis) => (
            <div key={axis} className="account-field map-axis">
              <label htmlFor={`${ids}-${axis}`}>
                {axis === 'x' ? t('Across, %') : t('Down, %')}
              </label>
              <input
                id={`${ids}-${axis}`}
                type="number"
                min={0}
                max={100}
                value={pinned ? percent(pinned[axis]) : ''}
                onChange={(event) => {
                  const value = Math.min(100, Math.max(0, Number(event.target.value) || 0)) / 100;
                  put(
                    axis === 'x' ? value : (pinned?.x ?? 0.5),
                    axis === 'y' ? value : (pinned?.y ?? 0.5),
                  );
                }}
              />
            </div>
          ))}
        </div>
        {regionId !== '' && (
          <MapCanvas
            api={api}
            regionId={regionId}
            pins={pins.map((pin) => ({
              place: { entityId: pin.placeId, kind: 'location', name: nameOf(pin.placeId) },
              x: pin.x,
              y: pin.y,
            }))}
            routes={[]}
            hereId={null}
            onPlace={(placeId) => {
              setPlacing(placeId);
            }}
            onPin={put}
          />
        )}
        <p className="field-hint">{t('Click the map to pin the chosen place there.')}</p>
        <div className="action-row">
          <button
            type="button"
            className="primary-button"
            disabled={locked || draft === null || regionId === ''}
            onClick={() => {
              onRun({
                kind: 'command',
                command: { type: 'SetMapPins', regionId, pins: [...pins] },
              });
              setDraft(null);
            }}
          >
            {t('Save the pins')}
          </button>
          {pinned && (
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                setDraft(pins.filter((pin) => pin.placeId !== placing));
              }}
            >
              {t('Unpin {place}', { place: nameOf(placing) })}
            </button>
          )}
        </div>
        <RouteForm map={map} places={places} locked={locked} onRun={onRun} />
      </div>
    </Opening>
  );
}

/** A route set between two places, or taken away. */
function RouteForm({
  map,
  places,
  locked,
  onRun,
}: {
  readonly map: WorldMapResponse;
  readonly places: readonly Place[];
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const ids = useId();
  const [fromId, setFromId] = useState(places[0]?.entityId ?? '');
  const [toId, setToId] = useState(places[1]?.entityId ?? '');
  const [miles, setMiles] = useState(1);
  const [terrain, setTerrain] = useState<TravelTerrain>('grassland');
  const [road, setRoad] = useState(true);
  const set = (route: { miles: number; terrain: TravelTerrain; road: boolean } | null) => {
    onRun({ kind: 'command', command: { type: 'SetRoute', fromId, toId, route } });
  };
  const exists = map.routes.some(
    (one) =>
      (one.from.entityId === fromId && one.to.entityId === toId) ||
      (one.from.entityId === toId && one.to.entityId === fromId),
  );
  const select = (id: string, label: string, value: string, change: (next: string) => void) => (
    <div className="account-field">
      <label htmlFor={`${ids}-${id}`}>{label}</label>
      <select
        id={`${ids}-${id}`}
        value={value}
        onChange={(event) => {
          change(event.target.value);
        }}
      >
        {places.map((one) => (
          <option key={one.entityId} value={one.entityId}>
            {one.name}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <fieldset className="route-form">
      <legend>{t('A route')}</legend>
      <div className="hand-row">
        {select('from', t('First place'), fromId, setFromId)}
        {select('to', t('Second place'), toId, setToId)}
      </div>
      <div className="hand-row">
        <div className="account-field">
          <label htmlFor={`${ids}-miles`}>{t('Miles')}</label>
          <input
            id={`${ids}-miles`}
            type="number"
            min={1}
            max={MAX_ROUTE_MILES}
            value={miles}
            onChange={(event) => {
              const next = Math.round(Number(event.target.value));
              setMiles(Math.min(MAX_ROUTE_MILES, Math.max(1, next || 1)));
            }}
          />
        </div>
        <div className="account-field">
          <label htmlFor={`${ids}-terrain`}>{t('Terrain')}</label>
          <select
            id={`${ids}-terrain`}
            value={terrain}
            onChange={(event) => {
              setTerrain(event.target.value as TravelTerrain);
            }}
          >
            {TRAVEL_TERRAINS.map((one) => (
              <option key={one} value={one}>
                {t(TERRAIN_WORDS[one])}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={road}
          onChange={(event) => {
            setRoad(event.target.checked);
          }}
        />
        {t('A good road runs there')}
      </label>
      <div className="action-row">
        <button
          type="button"
          className="primary-button"
          disabled={locked || fromId === toId}
          onClick={() => {
            set({ miles, terrain, road });
          }}
        >
          {exists ? t('Change the route') : t('Set the route')}
        </button>
        {exists && (
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              set(null);
            }}
          >
            {t('Take the route away')}
          </button>
        )}
      </div>
    </fieldset>
  );
}
