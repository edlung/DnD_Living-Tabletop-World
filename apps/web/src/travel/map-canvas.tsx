import type { MapPinView, RouteView, ScenePresentationResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { useApprovedImage, withPictureTimes } from '../visual/approved-images.ts';
import { textureUrl } from '../visual/ui-kit.ts';
import { pinSides, type PinLabel } from './pin-labels.ts';

/**
 * A region's map (docs/adr/0057-encounters-maps-loot.md §10): the region's approved picture — the
 * parchment until it has one — with its pinned places, each a button that opens the place, the
 * routes between them drawn under the pins, and where the party stands marked. The DM's editor
 * places a pin where the map is clicked. Names never stack: one with no free side waits for the
 * pointer or focus (`pin-labels.ts`), and the button keeps it as its label.
 */
export function MapCanvas({
  api,
  regionId,
  pins,
  routes,
  hereId,
  onPlace,
  onPin,
}: {
  readonly api: WorldApi;
  readonly regionId: string;
  readonly pins: readonly MapPinView[];
  readonly routes: readonly RouteView[];
  readonly hereId: string | null;
  readonly onPlace: (placeId: string) => void;
  /** While the DM places a pin: where the map was clicked, as fractions. */
  readonly onPin?: (x: number, y: number) => void;
}) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) =>
      api
        .get<ScenePresentationResponse>(`locations/${encodeURIComponent(regionId)}/scene`, signal)
        // The map's picture is fetched for the time it was chosen for, as a scene's is (Gate 06).
        .then(withPictureTimes),
    [api, regionId],
  );
  const { resource } = useResource(`region-map:${regionId}`, load);
  const url = useApprovedImage(resource.status === 'ready' ? resource.value.location.image : null);
  const canvas = useRef<HTMLDivElement>(null);
  const sides = usePinSides(canvas, pins, hereId);
  const at = new Map(pins.map((pin) => [pin.place.entityId, pin]));
  const drawn = routes.flatMap((route) => {
    const from = at.get(route.from.entityId);
    const to = at.get(route.to.entityId);
    return from && to ? [{ route, from, to }] : [];
  });
  const pinHere = (event: MouseEvent<HTMLDivElement>) => {
    if (!onPin || event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (value: number) => Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));
    onPin(
      fraction((event.clientX - box.left) / box.width),
      fraction((event.clientY - box.top) / box.height),
    );
  };
  return (
    <div ref={canvas} className={`map-canvas${onPin ? ' map-canvas--pinning' : ''}`}>
      <img className="map-art" src={url ?? textureUrl('parchment')} alt="" aria-hidden="true" />
      <svg
        className="map-routes"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Each route a dark casing under its line, to be seen on any picture. */}
        {drawn.flatMap(({ route, from, to }) =>
          ['map-route-casing', route.road ? 'map-route map-route--road' : 'map-route'].map(
            (className) => (
              <line
                key={`${className}:${route.from.entityId}~${route.to.entityId}`}
                className={className}
                x1={from.x * 100}
                y1={from.y * 100}
                x2={to.x * 100}
                y2={to.y * 100}
                vectorEffect="non-scaling-stroke"
              />
            ),
          ),
        )}
      </svg>
      {/* A click on the bare map, never on a pin, places the DM's pin; the editor's X and Y
          fields are the keyboard's way. */}
      <div className="map-hit" onClick={pinHere}>
        {pins.map((pin) => {
          const here = pin.place.entityId === hereId;
          // Until measured, near the right edge the name goes on the dot's left, inside the map.
          const label = sides[pin.place.entityId] ?? {
            side: pin.x > 0.6 ? 'left' : 'right',
            quiet: false,
          };
          return (
            <button
              key={pin.place.entityId}
              type="button"
              data-place={pin.place.entityId}
              className={`map-pin${here ? ' map-pin--here' : ''}${label.side === 'left' ? ' map-pin--left' : ''}${label.quiet ? ' map-pin--quiet' : ''}`}
              style={{ left: `${String(pin.x * 100)}%`, top: `${String(pin.y * 100)}%` }}
              aria-label={
                here ? t('{place}, where you are', { place: pin.place.name }) : pin.place.name
              }
              onClick={() => {
                onPlace(pin.place.entityId);
              }}
            >
              <span className="map-pin-dot" aria-hidden="true" />
              <span className="map-pin-name">{pin.place.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Each pin's side, measured against the drawn names whenever the map or its pins change size. */
function usePinSides(
  canvas: { readonly current: HTMLDivElement | null },
  pins: readonly MapPinView[],
  hereId: string | null,
): Record<string, PinLabel> {
  const [sides, setSides] = useState<Record<string, PinLabel>>({});
  const key = pins
    .map((pin) => `${pin.place.entityId}@${String(pin.x)},${String(pin.y)}`)
    .join('|');
  useLayoutEffect(() => {
    const box = canvas.current;
    if (!box) return;
    const measure = () => {
      // Measured as drawn: the dot's centre and the name's plate, relative to the map's box.
      const frame = { width: box.clientWidth, height: box.clientHeight };
      const origin = box.getBoundingClientRect();
      const left = origin.left + box.clientLeft;
      const top = origin.top + box.clientTop;
      const boxes = [...box.querySelectorAll<HTMLElement>('.map-pin')].flatMap((button) => {
        const id = button.dataset['place'];
        const dot = button.querySelector<HTMLElement>('.map-pin-dot')?.getBoundingClientRect();
        const name = button.querySelector<HTMLElement>('.map-pin-name')?.getBoundingClientRect();
        return id && dot && name
          ? [
              {
                id,
                x: dot.left + dot.width / 2 - left,
                y: dot.top + dot.height / 2 - top,
                width: name.width,
                height: name.height,
              },
            ]
          : [];
      });
      const next = pinSides(boxes, frame, hereId);
      setSides((now) => (JSON.stringify(now) === JSON.stringify(next) ? now : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => {
      observer.disconnect();
    };
    // The pins' identities and places are the key: a new array of the same pins measures nothing.
  }, [canvas, key, hereId]);
  return sides;
}
