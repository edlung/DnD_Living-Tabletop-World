import type {
  ChronicleListResponse,
  KnowledgeListResponse,
  KnownEntitiesResponse,
  QuestListResponse,
} from '@ltw/contracts';
import { useCallback, useMemo } from 'react';

import type { WorldApi } from '../../api/client.ts';
import { useResource, type Resource } from '../../api/resource.ts';
import { useRereadOn } from '../../world/use-world-data.ts';
import { PARTY } from '../book-chapters.ts';
import { assembleKnown, type KnownBook } from './known-model.ts';

/**
 * The party's encyclopedia as it is read (docs/adr/0073-table-ideas.md §4): every read is the
 * party's, whoever opens it — a player, or the DM, whose secrets and own notes are in none of
 * them. What the party knows of must be read; its records, chapters and quests may fail and leave
 * the page without them. Read while `shown` — and again on the live signal then.
 */
export function useKnown(
  api: WorldApi,
  shown: boolean,
  revision: number,
): {
  /** The party's view: the page's pictures are read through it too. */
  readonly api: WorldApi;
  readonly resource: Resource<KnownBook | null>;
  readonly retry: () => void;
} {
  const party = useMemo(() => api.as(PARTY), [api]);
  const load = useCallback(
    async (signal: AbortSignal): Promise<KnownBook | null> => {
      if (!shown) return null;
      const spare = <T>(read: Promise<T>): Promise<T | null> => read.catch(() => null);
      const [entities, knowledge, chronicle, quests] = await Promise.all([
        party.get<KnownEntitiesResponse>('entities', signal),
        spare(party.get<KnowledgeListResponse>('knowledge', signal)),
        spare(party.get<ChronicleListResponse>('chronicle', signal)),
        spare(party.get<QuestListResponse>('quests', signal)),
      ]);
      return assembleKnown({
        entities: entities.entities,
        knowledge: knowledge?.knowledge ?? [],
        chapters: chronicle?.chapters ?? [],
        quests: quests?.quests ?? [],
      });
    },
    [party, shown],
  );
  const read = useResource(`known:${String(shown)}`, load);
  useRereadOn(revision, read.reread);
  return { api: party, resource: read.resource, retry: read.retry };
}
