import type { CharacterSheetResponse } from '@ltw/contracts';
import { useCallback } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { useRereadOn } from '../world/use-world-data.ts';

export function useHeroSheet(api: WorldApi, entityId: string, revision: number) {
  // A person the DM added in words has no sheet until one is set: the server's 404 then says so
  // plainly instead of a failure with Retry (Stage 360).
  const load = useCallback(
    (signal: AbortSignal) =>
      api
        .get<CharacterSheetResponse>(`entities/${encodeURIComponent(entityId)}/sheet`, signal)
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        }),
    [api, entityId],
  );
  const read = useResource(`hero:${entityId}`, load);
  useRereadOn(revision, read.reread);
  return read;
}
