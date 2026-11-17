import type { ReflectionView, ReflectionsResponse, SessionReflections } from '@ltw/contracts';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { useRereadOn } from '../world/use-world-data.ts';

/**
 * Stars and wishes as a screen reads them (docs/adr/0071-memory-and-ritual.md §2): the ended
 * sessions, newest first, each with the stars everyone reads and the wishes this reader may.
 */
export function useReflections(api: WorldApi, revision = 0) {
  const load = useCallback(
    (signal: AbortSignal) => api.get<ReflectionsResponse>('reflections', signal),
    [api],
  );
  const read = useResource('reflections', load);
  useRereadOn(revision, read.reread);
  return {
    sessions: read.resource.status === 'ready' ? read.resource.value.sessions : null,
    reread: read.reread,
  };
}

/** The session stars and wishes are being written for; null once the next one has started. */
export const openSession = (
  sessions: readonly SessionReflections[] | null,
): SessionReflections | null => sessions?.find((session) => session.open) ?? null;

/** The entries that hold a star, as everyone reads them. */
export const starsOf = (session: SessionReflections): readonly ReflectionView[] =>
  session.entries.filter((entry) => entry.star !== '');

/** The entries whose wish this reader may read and that hold one. */
export const wishesOf = (session: SessionReflections): readonly ReflectionView[] =>
  session.entries.filter((entry) => entry.wish !== null && entry.wish !== '');

/** Writes an author's star and wish; both empty takes them away. False when it did not go through. */
export async function writeReflection(
  api: WorldApi,
  body: {
    readonly sessionId: string;
    readonly characterId: string | null;
    readonly star: string;
    readonly wish: string;
  },
): Promise<boolean> {
  return api.post('reflections', body, AbortSignal.timeout(20_000), true).then(
    () => true,
    () => false,
  );
}
