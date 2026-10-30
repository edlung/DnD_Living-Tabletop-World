import type { PlayerAssetView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import type { ReactNode } from 'react';

import { useApprovedImage } from '../visual/approved-images.ts';
import { textureUrl } from '../visual/ui-kit.ts';

/**
 * The stage's background (docs/STAGE_320_DESIGN.md §5.1): the viewed place's approved image for
 * its phase and weather, under a vignette for legibility. Without one — none approved yet, or
 * not loaded — the neutral mist, and, once the scene has said so, a short note. A UI-kit picture
 * never stands in for the place.
 */
export function Backdrop({
  image,
  settled,
  missingImageNote,
}: {
  readonly image: PlayerAssetView | null;
  /** The scene has loaded: a missing image is now known to be missing. */
  readonly settled: boolean;
  readonly missingImageNote?: ReactNode;
}) {
  const t = useT();
  const url = useApprovedImage(image);
  return (
    <div className={`stage-backdrop${url ? '' : ' stage-backdrop--mist'}`}>
      <img
        className="backdrop-art"
        src={url ?? textureUrl('scene-fallback')}
        alt=""
        aria-hidden="true"
      />
      <div className="backdrop-vignette" aria-hidden="true" />
      {settled && !image && (
        <p className="backdrop-note">{missingImageNote ?? t('No approved image yet')}</p>
      )}
    </div>
  );
}
