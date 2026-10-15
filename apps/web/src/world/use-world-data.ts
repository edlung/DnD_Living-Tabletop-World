import type {
  EncounterResponse,
  KnowledgeListResponse,
  KnownEntitiesResponse,
  ScenePresentationResponse,
  SessionListResponse,
  SurroundingsResponse,
} from '@ltw/contracts';
import { useCallback, useEffect, useRef } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';

/**
 * After the viewer's own action the world screen's views are read again in the background,
 * as a live signal would: what is shown stays until the new answer arrives, so the stage does
 * not empty and flash after each step (ADR 0033 §4). A perspective change or "Refresh world"
 * still remounts the screen and reads afresh.
 */
function useRereadOn(revision: number, reread: () => void): void {
  const seen = useRef(revision);
  useEffect(() => {
    if (seen.current === revision) return;
    seen.current = revision;
    reread();
  }, [revision]);
}

export interface WorldData {
  readonly directory: KnownEntitiesResponse;
  readonly encounter: EncounterResponse;
  readonly sessions: SessionListResponse;
  readonly knowledge: KnowledgeListResponse;
  readonly surroundings: SurroundingsResponse | null;
  /** The screen's action count when this read started: older reads may predate an arrival. */
  readonly asOf: number;
}

/** The world screen's own views for one perspective. */
export function useWorldData(api: WorldApi, acting: boolean, revision: number) {
  const asOf = useRef(revision);
  useEffect(() => {
    asOf.current = revision;
  }, [revision]);
  const load = useCallback(
    async (signal: AbortSignal): Promise<WorldData> => {
      const at = asOf.current;
      const [directory, encounter, sessions, knowledge, surroundings] = await Promise.all([
        api.get<KnownEntitiesResponse>('entities', signal),
        api.get<EncounterResponse>('encounter', signal),
        api.get<SessionListResponse>('sessions', signal, false),
        api.get<KnowledgeListResponse>('knowledge', signal),
        acting ? api.get<SurroundingsResponse>('surroundings', signal) : Promise.resolve(null),
      ]);
      return { directory, encounter, sessions, knowledge, surroundings, asOf: at };
    },
    [api, acting],
  );
  const { resource, retry, reread } = useResource('world', load);
  useRereadOn(revision, reread);
  return { resource, retry };
}

/** How the viewed place looks now (ADR 0023): its approved image, phase, weather and who is there. */
export function useScene(api: WorldApi, placeId: string, revision: number) {
  const load = useCallback(
    (signal: AbortSignal) =>
      placeId === ''
        ? Promise.resolve(null)
        : api.get<ScenePresentationResponse>(
            `locations/${encodeURIComponent(placeId)}/scene`,
            signal,
          ),
    [api, placeId],
  );
  const { resource, retry, reread } = useResource(`scene:${placeId}`, load);
  useRereadOn(revision, reread);
  return { resource, retry };
}
