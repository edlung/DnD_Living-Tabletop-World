import type { ReactNode } from 'react';

import { ApprovedImagesContext, type ApprovedImages } from '../visual/approved-images.ts';
import { DmImagesContext, type DmImages } from './dm-images.ts';

/**
 * The world screen's pictures: the cache of fetched pictures for every view, and the DM's image
 * controls (docs/STAGE_330_DESIGN.md "DM controls") in the DM perspective alone — null below it,
 * so nothing there reads the lineage or shows a candidate.
 */
export function WorldPictures({
  images,
  dm,
  children,
}: {
  readonly images: ApprovedImages;
  readonly dm: DmImages | null;
  readonly children: ReactNode;
}) {
  return (
    <ApprovedImagesContext.Provider value={images}>
      <DmImagesContext.Provider value={dm}>{children}</DmImagesContext.Provider>
    </ApprovedImagesContext.Provider>
  );
}
