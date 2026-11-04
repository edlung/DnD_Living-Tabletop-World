import type { DmLibraryResponse } from '@ltw/contracts';
import { useCallback, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import { useResource, type Resource } from '../api/resource.ts';
import type { KeepOutcome } from '../handouts/handouts.tsx';

/**
 * The DM's library (docs/adr/0058-campaign-content.md §3–4): the kept handouts and the random
 * tables, read by the DM's sheets and reread after each write. Nobody else reads it.
 */
export interface Library {
  readonly resource: Resource<DmLibraryResponse>;
  readonly retry: () => void;
  readonly reread: () => void;
  readonly busy: boolean;
  /** A write: 'full' when the campaign holds as many as it may (a 409). */
  readonly write: (path: string, body: unknown) => Promise<KeepOutcome>;
}

export function useLibrary(api: WorldApi): Library {
  const load = useCallback(
    (signal: AbortSignal) => api.get<DmLibraryResponse>('dm/library', signal, false),
    [api],
  );
  const library = useResource('dm-library', load);
  const [busy, setBusy] = useState(false);
  const write = async (path: string, body: unknown): Promise<KeepOutcome> => {
    setBusy(true);
    try {
      await api.post(path, body, AbortSignal.timeout(20_000));
      return 'done';
    } catch (failure) {
      return failure instanceof ApiError && failure.status === 409 ? 'full' : 'failed';
    } finally {
      setBusy(false);
      library.reread();
    }
  };
  return {
    resource: library.resource,
    retry: library.retry,
    reread: library.reread,
    busy,
    write,
  };
}
