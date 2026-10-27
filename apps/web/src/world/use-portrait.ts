import type { EntityPresentationResponse, PlayerAssetView } from '@ltw/contracts';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { withPictureTimes } from '../visual/approved-images.ts';

/**
 * The approved image of an entity as this perspective sees it now (`…/presentation`, ADR 0023),
 * or null — while it loads, when there is none, or when the view is refused — so the caller
 * shows the neutral silhouette or mist. Never anything in an image's place.
 */
export function usePortrait(api: WorldApi, entityId: string): PlayerAssetView | null {
  const load = useCallback(
    (signal: AbortSignal) =>
      api
        .get<EntityPresentationResponse>(
          `entities/${encodeURIComponent(entityId)}/presentation`,
          signal,
        )
        // Its picture is fetched for the time it was chosen for (Gate 06).
        .then(withPictureTimes),
    [api, entityId],
  );
  const { resource } = useResource(`portrait:${entityId}`, load);
  return resource.status === 'ready' ? resource.value.presentation.image : null;
}
