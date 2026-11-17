import type {
  ChronicleListResponse,
  KnowledgeListResponse,
  KnownEntitiesResponse,
  QuestListResponse,
} from '@ltw/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { WorldApi } from '../../api/client.ts';
import { useResource } from '../../api/resource.ts';
import { useRereadOn } from '../../world/use-world-data.ts';
import { PARTY } from '../book-chapters.ts';
import { assembleKnown, type KnownBook } from './known-model.ts';

/** The page as it was last read, and what of it could not be. */
export interface KnownRead {
  readonly book: KnownBook;
  /** The party's records could not be read: an entry without facts is not known to have none. */
  readonly factsMissing: boolean;
  /** Some part — records, chapters, quests — could not be read and is left out. */
  readonly partial: boolean;
}

interface Parts {
  knowledge: KnowledgeListResponse['knowledge'] | null;
  chapters: ChronicleListResponse['chapters'] | null;
  quests: QuestListResponse['quests'] | null;
}

/**
 * The party's encyclopedia as it is read (docs/adr/0073-table-ideas.md §4): every read is the
 * party's, whoever opens it — a player, or the DM, whose secrets and own notes are in none of
 * them. What the party knows of must be read; its records, chapters and quests may fail: a part
 * read before stays as it was, and one never read is left out and said to be. Read while `shown`
 * — and again on the live signal then; put away, the page keeps what it last read, so coming
 * back to it shows it at once.
 */
export function useKnown(
  api: WorldApi,
  shown: boolean,
  revision: number,
): {
  /** The party's view: the page's pictures are read through it too. */
  readonly api: WorldApi;
  /** Null until the page has been read once. */
  readonly known: KnownRead | null;
  /** The first read failed: nothing to show yet. */
  readonly failed: boolean;
  readonly retry: () => void;
} {
  const party = useMemo(() => api.as(PARTY), [api]);
  const looking = useRef(shown);
  const last = useRef<KnownRead | null>(null);
  const parts = useRef<Parts>({ knowledge: null, chapters: null, quests: null });
  const [failed, setFailed] = useState(false);
  const load = useCallback(
    async (signal: AbortSignal): Promise<KnownRead | null> => {
      // Put away, nothing is read: the page keeps what it had.
      if (!looking.current) return last.current;
      const spare = <T>(read: Promise<T>): Promise<T | null> => read.catch(() => null);
      const [entities, knowledge, chronicle, quests] = await Promise.all([
        spare(party.get<KnownEntitiesResponse>('entities', signal)),
        spare(party.get<KnowledgeListResponse>('knowledge', signal)),
        spare(party.get<ChronicleListResponse>('chronicle', signal)),
        spare(party.get<QuestListResponse>('quests', signal)),
      ]);
      if (entities === null) {
        // Nothing to build the page from: what was shown stays; a first read says it failed.
        if (last.current === null && !signal.aborted) setFailed(true);
        return last.current;
      }
      // A part that fails now keeps what an earlier read brought.
      const held = parts.current;
      if (knowledge !== null) held.knowledge = knowledge.knowledge;
      if (chronicle !== null) held.chapters = chronicle.chapters;
      if (quests !== null) held.quests = quests.quests;
      setFailed(false);
      last.current = {
        book: assembleKnown({
          entities: entities.entities,
          knowledge: held.knowledge ?? [],
          chapters: held.chapters ?? [],
          quests: held.quests ?? [],
        }),
        factsMissing: held.knowledge === null,
        partial: held.knowledge === null || held.chapters === null || held.quests === null,
      };
      return last.current;
    },
    [party],
  );
  const read = useResource('known', load);
  const { reread } = read;
  useRereadOn(revision, reread);
  // Looked at again: read now; what was read before shows meanwhile.
  useEffect(() => {
    looking.current = shown;
    if (shown) reread();
  }, [shown, reread]);
  return {
    api: party,
    known: read.resource.status === 'ready' ? read.resource.value : null,
    failed,
    retry: () => {
      setFailed(false);
      reread();
    },
  };
}
