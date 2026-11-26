import type { PlayerAssetView } from '@ltw/contracts';

import { useHeldImage } from '../../visual/approved-images.ts';

/**
 * The board's ground (docs/STAGE_320_DESIGN.md §5.5, ADR 0034 §6; ADR 0035 §4): the encounter
 * place's approved top-down battle map when there is one — the GPT picture the DM approved,
 * stretched over the grid, or a map whose grid the DM lined up (docs/adr/0057-encounters-maps-
 * loot.md §3), drawn so that each of its cells lies under a square of the board — else the UI
 * kit's neutral ground texture, which claims nothing about the place. The frame, light and shade
 * over either are drawn markup.
 */
export function BoardGround({
  map,
  cell,
  bleed = null,
}: {
  readonly map: PlayerAssetView | null;
  /** A square's size on the board, in CSS pixels. */
  readonly cell: number;
  readonly bleed?: { readonly x: number; readonly top: number; readonly bottom: number } | null;
}) {
  const { url, held } = useHeldImage(map);
  const grid = map?.grid;
  const scale = grid ? cell / grid.cellPx : 1;
  return (
    <>
      {bleed && !grid && url && (
        <span
          aria-hidden="true"
          className="board-painted-margin"
          style={{
            inset: `-${bleed.top}px -${bleed.x}px -${bleed.bottom}px`,
            borderWidth: `${bleed.top}px ${bleed.x}px ${bleed.bottom}px`,
            borderImageSource: `url("${url}")`,
          }}
        />
      )}
      <span className={`board-ground${held ? ' board-ground--map' : ''}`} aria-hidden="true">
        {url &&
          (grid ? (
            <img
              className="board-map board-map--aligned"
              src={url}
              alt=""
              draggable={false}
              style={{
                left: -grid.originX * scale,
                top: -grid.originY * scale,
                transform: `scale(${String(scale)})`,
              }}
            />
          ) : (
            <img className="board-map" src={url} alt="" draggable={false} />
          ))}
      </span>
    </>
  );
}
