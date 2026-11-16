import type {
  ChronicleListResponse,
  HandoutsResponse,
  KnownEntitiesResponse,
  ReflectionsResponse,
  SessionListResponse,
  SessionResponse,
} from '@ltw/contracts';
import { useCallback, useMemo, useState } from 'react';

import type { WorldApi } from '../../api/client.ts';
import { useResource, type Resource } from '../../api/resource.ts';
import { useRereadOn } from '../../world/use-world-data.ts';
import { PARTY } from '../book-chapters.ts';
import { assembleBook, type KeepsakeBook } from './book-model.ts';

export interface ReadBook {
  /** The campaign's name, for the cover. */
  readonly name: string;
  readonly book: KeepsakeBook;
}

/**
 * The book of the campaign as it is read (docs/adr/0072-keepsakes.md §1): every read is the
 * party's, whoever opens the book — a player, or the DM, whose own chapters, secrets and the
 * wishes are in none of them. The chapters must be read; the stars, what was shown to the party
 * and the heroes may fail and leave the book without them. Read while `shown` — and again on the
 * live signal then — and not otherwise; what was read last stays (`book`) while it is read again.
 */
export function useBook(
  api: WorldApi,
  shown: boolean,
  revision: number,
): {
  /** The party's view: the book's pictures are read through it too. */
  readonly api: WorldApi;
  /** The book as last read; null before the first reading. */
  readonly book: ReadBook | null;
  readonly resource: Resource<ReadBook | null>;
  readonly retry: () => void;
} {
  const party = useMemo(() => api.as(PARTY), [api]);
  const load = useCallback(
    async (signal: AbortSignal): Promise<ReadBook | null> => {
      if (!shown) return null;
      const spare = <T>(read: Promise<T>): Promise<T | null> => read.catch(() => null);
      const [chronicle, sessions, identity, reflections, handouts, entities] = await Promise.all([
        party.get<ChronicleListResponse>('chronicle', signal),
        party.get<SessionListResponse>('sessions', signal, false),
        party.get<SessionResponse>('session', signal, false),
        spare(party.get<ReflectionsResponse>('reflections', signal, true, { book: 'true' })),
        spare(party.get<HandoutsResponse>('handouts', signal)),
        spare(party.get<KnownEntitiesResponse>('entities', signal)),
      ]);
      return {
        name: identity.campaign.name,
        book: assembleBook({
          chapters: chronicle.chapters,
          sessions: sessions.sessions,
          reflections: reflections?.sessions ?? [],
          handouts: handouts?.handouts ?? [],
          entities: entities?.entities ?? [],
        }),
      };
    },
    [party, shown],
  );
  const read = useResource(`keepsake:${String(shown)}`, load);
  useRereadOn(revision, read.reread);
  const [last, setLast] = useState<{ readonly of: WorldApi; readonly book: ReadBook } | null>(null);
  const fresh = read.resource.status === 'ready' ? read.resource.value : null;
  if (fresh !== null && (last?.book !== fresh || last.of !== party)) {
    setLast({ of: party, book: fresh });
  }
  // Another view's book is never shown in this one's place.
  const book = fresh ?? (last?.of === party ? last.book : null);
  return { api: party, book, resource: read.resource, retry: read.retry };
}
