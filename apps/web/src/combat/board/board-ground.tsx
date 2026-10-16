import type { PlayerAssetView } from '@ltw/contracts';

import { useHeldImage } from '../../visual/approved-images.ts';

/**
 * The board's ground (docs/STAGE_320_DESIGN.md §5.5, ADR 0034 §6; ADR 0035 §4): the encounter
 * place's approved top-down battle map when there is one — the GPT picture the DM approved,
 * stretched over the grid — else the UI kit's neutral ground texture, which claims nothing about
 * the place. The frame, light and shade over either are drawn markup.
 */
export function BoardGround({ map }: { readonly map: PlayerAssetView | null }) {
  const { url, held } = useHeldImage(map);
  return (
    <span className={`board-ground${held ? ' board-ground--map' : ''}`} aria-hidden="true">
      {url && <img className="board-map" src={url} alt="" draggable={false} />}
    </span>
  );
}
