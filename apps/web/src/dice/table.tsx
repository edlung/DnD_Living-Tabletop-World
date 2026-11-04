import type {
  ChatLogResponse,
  ChatMessageRequest,
  CheckRequestInput,
  CheckRequestsResponse,
  HandoutRequest,
  HandoutsResponse,
  HandoutView,
  LobbyResponse,
  RestResponse,
  RestView,
  RollEntry,
  RollFeedResponse,
  TableRerollRequest,
  TableRollRequest,
  TableSound,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import { useResource, type Resource } from '../api/resource.ts';
import { useRereadOn } from '../world/use-world-data.ts';

/**
 * The table's dice in the client (Stage 510): the roll feed this perspective may see, the DM's check
 * requests, the open short rest (Stage 530), and the writes — a roll, a request, a cancel — each
 * followed by a re-read. Every die is the server's; the client only shows it.
 */
export interface DiceTable {
  readonly feed: Resource<RollFeedResponse>;
  readonly requests: Resource<CheckRequestsResponse>;
  /** The short rest the DM opened, while it lasts (Stage 530). */
  readonly rest: RestView | null;
  /** Rolls that arrived since this screen first read the feed, oldest first, once each. */
  readonly fresh: readonly RollEntry[];
  readonly takeFresh: () => void;
  /** Rolls still flying: the log and the announcement wait until they land. */
  readonly flying: ReadonlySet<string>;
  readonly land: (rollId: string) => void;
  readonly roll: (body: TableRollRequest) => Promise<boolean>;
  readonly ask: (body: CheckRequestInput) => Promise<boolean>;
  readonly cancel: (requestId: string) => Promise<boolean>;
  /** The DM's word that an entered roll is what the dice showed (ADR 0044 §4). */
  readonly confirm: (rollId: string) => Promise<boolean>;
  /**
   * The viewer's latest check its Heroic Inspiration may roll again, as the server says
   * (docs/adr/0046-reactions-beyond-counterspell.md §6), and the reroll: the app's d20 or one's own.
   */
  readonly rerollable: string | null;
  readonly reroll: (rollId: string, body: TableRerollRequest) => Promise<boolean>;
  readonly busy: boolean;
  readonly error: string | null;
  readonly isDm: boolean;
  /** The campaign's dice are the players' own: faces may be entered (ADR 0044 §4). */
  readonly physical: boolean;
  /** The session plays online: every screen shows the table's (ADR 0044 §5). */
  readonly online: boolean;
  /** What the table hears, as the DM chose it (docs/adr/0059-atmosphere.md); null until read. */
  readonly sound: TableSound | null;
  /** Handouts this perspective reads (ADR 0044 §5), oldest first. */
  readonly handouts: readonly HandoutView[];
  /** Handouts that arrived since the table was first read here, not yet opened. */
  readonly unreadHandouts: readonly HandoutView[];
  readonly readHandout: (handoutId: string) => void;
  /** The DM gives a handout. */
  readonly give: (body: HandoutRequest) => Promise<boolean>;
  /** The DM gives a handout kept for later, to one character's player or the party (ADR 0058 §3). */
  readonly giveKept: (entryId: string, recipientId: string | null) => Promise<boolean>;
  /** The DM rolls on a random table, for the DM alone or for the table (ADR 0058 §4). */
  readonly rollOnTable: (entryId: string, hidden: boolean) => Promise<boolean>;
  /** The character this perspective acts as; null for the DM. */
  readonly characterId: string | null;
  /** Table talk (docs/adr/0044-online-play.md §1), read with the dice. */
  readonly chat: TableChat;
}

export interface TableChat {
  readonly log: Resource<ChatLogResponse>;
  /** Others' messages since the chat was last read on this screen. */
  readonly unread: number;
  readonly markRead: () => void;
  readonly send: (body: ChatMessageRequest) => Promise<boolean>;
}

const DiceTableContext = createContext<DiceTable | null>(null);
export const DiceTableProvider = DiceTableContext.Provider;
/** The table's dice, where the world screen provides them (null elsewhere: the workshop). */
export const useDiceTable = (): DiceTable | null => useContext(DiceTableContext);

/** Most rolls animated after one read: an older backlog is only listed. */
const AT_ONCE = 3;

export function useDiceTableState(
  api: WorldApi,
  revision: number,
  perspective: string,
  characterId: string | null,
): DiceTable {
  const t = useT();
  const isDm = perspective === 'DM';
  const rolling = isDm || characterId !== null;
  // Until a player's character is known the table reads nothing; the first real reads then start
  // afresh (a new key shows them loading), so nothing already there passes for news: no old roll
  // thrown again, no old message unread, no question already waiting rung again.
  const scope = `${perspective}|${rolling ? (characterId ?? 'dm') : 'none'}`;
  const loadFeed = useCallback(
    (signal: AbortSignal) =>
      rolling
        ? api.get<RollFeedResponse>('rolls', signal)
        : Promise.resolve({ perspective, rolls: [] }),
    [api, rolling, perspective],
  );
  const loadRequests = useCallback(
    (signal: AbortSignal) =>
      rolling
        ? api.get<CheckRequestsResponse>('check-requests', signal)
        : Promise.resolve({ perspective, requests: [] }),
    [api, rolling, perspective],
  );
  const loadRest = useCallback(
    (signal: AbortSignal) =>
      rolling
        ? api.get<RestResponse>('rest', signal)
        : Promise.resolve({ perspective, rest: null }),
    [api, rolling, perspective],
  );
  const loadChat = useCallback(
    (signal: AbortSignal) =>
      rolling
        ? api.get<ChatLogResponse>('chat', signal)
        : Promise.resolve({ perspective, messages: [] }),
    [api, rolling, perspective],
  );
  const chatLog = useResource(`chat:${scope}`, loadChat);
  // The campaign's dice (ADR 0044 §4), from the table's state; the live stream covers it.
  const loadLobby = useCallback(
    (signal: AbortSignal) =>
      rolling ? api.get<LobbyResponse>('lobby', signal) : Promise.resolve(null),
    [api, rolling],
  );
  const lobby = useResource(`lobby-dice:${scope}`, loadLobby);
  useRereadOn(revision, lobby.reread);
  const physical = lobby.resource.status === 'ready' && lobby.resource.value?.dice === 'physical';
  const online = lobby.resource.status === 'ready' && lobby.resource.value?.mode === 'online';
  const sound = lobby.resource.status === 'ready' ? (lobby.resource.value?.sound ?? null) : null;
  // Handouts (ADR 0044 §5): those there at the first read are read; later ones wait to be opened.
  const loadHandouts = useCallback(
    (signal: AbortSignal) =>
      rolling
        ? api.get<HandoutsResponse>('handouts', signal)
        : Promise.resolve({ perspective, handouts: [] }),
    [api, rolling, perspective],
  );
  const handoutLog = useResource(`handouts:${scope}`, loadHandouts);
  useRereadOn(revision, handoutLog.reread);
  const handouts =
    handoutLog.resource.status === 'ready' ? handoutLog.resource.value.handouts : null;
  const [opened, setOpened] = useState<{ scope: string; ids: ReadonlySet<string> } | null>(null);
  const openedIds = opened?.scope === scope ? opened.ids : null;
  useEffect(() => {
    if (handouts !== null && openedIds === null) {
      setOpened({ scope, ids: new Set(handouts.map((handout) => handout.handoutId)) });
    }
  }, [handouts, openedIds, scope]);
  const unreadHandouts =
    handouts === null || openedIds === null || isDm
      ? []
      : handouts.filter((handout) => !openedIds.has(handout.handoutId));
  useRereadOn(revision, chatLog.reread);
  // Messages read on this screen: the first read is read, later ones by others wait to be seen.
  const [read, setRead] = useState<{ scope: string; ids: ReadonlySet<string> } | null>(null);
  const readUpTo = read?.scope === scope ? read.ids : null;
  const messages = chatLog.resource.status === 'ready' ? chatLog.resource.value.messages : null;
  useEffect(() => {
    if (messages !== null && readUpTo === null) {
      setRead({ scope, ids: new Set(messages.map((message) => message.messageId)) });
    }
  }, [messages, readUpTo, scope]);
  const unread =
    messages === null || readUpTo === null
      ? 0
      : messages.filter(
          (message) =>
            !readUpTo.has(message.messageId) &&
            !(isDm ? message.speaker === null : message.speaker?.entityId === characterId),
        ).length;
  const feed = useResource(`rolls:${scope}`, loadFeed);
  const requests = useResource(`check-requests:${scope}`, loadRequests);
  const rest = useResource(`rest:${scope}`, loadRest);
  useRereadOn(revision, feed.reread);
  useRereadOn(revision, requests.reread);
  useRereadOn(revision, rest.reread);
  const [fresh, setFresh] = useState<readonly RollEntry[]>([]);
  const [flying, setFlying] = useState<ReadonlySet<string>>(new Set());
  const seen = useRef<{ readonly scope: string; readonly ids: Set<string> } | null>(null);
  useEffect(() => {
    if (feed.resource.status !== 'ready') return;
    const rolls = feed.resource.value.rolls;
    if (seen.current?.scope !== scope) {
      // The first read is the table as it was: nothing in it is thrown again.
      seen.current = { scope, ids: new Set(rolls.map((roll) => roll.rollId)) };
      return;
    }
    const known = seen.current.ids;
    const arrived = rolls.filter((roll) => !known.has(roll.rollId));
    for (const roll of arrived) known.add(roll.rollId);
    if (arrived.length === 0) return;
    const thrown = arrived.slice(-AT_ONCE);
    setFresh((queued) => [...queued, ...thrown].slice(-AT_ONCE));
    setFlying((now) => new Set([...now, ...thrown.map((roll) => roll.rollId)]));
  }, [feed.resource]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const write = useCallback(
    /** `conflict`: what a 409 means here, in the viewer's words. */
    async (path: string, body: unknown, conflict?: string) => {
      setBusy(true);
      setError(null);
      try {
        await api.post(path, body, AbortSignal.timeout(15_000), true);
        feed.reread();
        requests.reread();
        return true;
      } catch (failure) {
        setError(
          failure instanceof ApiError && failure.status === 409
            ? (conflict ?? t('That request was already answered or withdrawn.'))
            : t('The dice could not be rolled. Try again.'),
        );
        feed.reread();
        requests.reread();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [api, feed, requests, t],
  );
  return {
    feed: feed.resource,
    requests: requests.resource,
    rest: rest.resource.status === 'ready' ? rest.resource.value.rest : null,
    fresh,
    takeFresh: () => {
      setFresh([]);
    },
    flying,
    land: (rollId) => {
      setFlying((now) => {
        const next = new Set(now);
        next.delete(rollId);
        return next;
      });
    },
    roll: (body) => write('rolls', body),
    ask: (body) => write('check-requests', body),
    cancel: (requestId) => write(`check-requests/${encodeURIComponent(requestId)}/cancel`, {}),
    confirm: (rollId) =>
      write(`rolls/${encodeURIComponent(rollId.replace(/^table:/, ''))}/confirm`, {}),
    rerollable: feed.resource.status === 'ready' ? (feed.resource.value.rerollable ?? null) : null,
    reroll: (rollId, body) =>
      write(
        `rolls/${encodeURIComponent(rollId.replace(/^table:/, ''))}/reroll`,
        body,
        t('That roll can no longer be rolled again.'),
      ),
    busy,
    error,
    isDm,
    physical,
    online,
    sound,
    handouts: handouts ?? [],
    unreadHandouts,
    readHandout: (handoutId) => {
      setOpened((now) =>
        now?.scope === scope ? { scope, ids: new Set([...now.ids, handoutId]) } : now,
      );
    },
    give: async (body) => {
      try {
        await api.post('handouts', body, AbortSignal.timeout(15_000), true);
        handoutLog.reread();
        return true;
      } catch {
        return false;
      }
    },
    giveKept: async (entryId, recipientId) => {
      try {
        const path = `dm/library/handouts/${encodeURIComponent(entryId)}/give`;
        await api.post(
          path,
          recipientId === null ? {} : { recipientId },
          AbortSignal.timeout(15_000),
        );
        handoutLog.reread();
        return true;
      } catch {
        return false;
      }
    },
    rollOnTable: (entryId, hidden) =>
      write(`dm/library/tables/${encodeURIComponent(entryId)}/roll`, { hidden }),
    characterId,
    chat: {
      log: chatLog.resource,
      unread,
      markRead: () => {
        if (messages !== null) {
          setRead({ scope, ids: new Set(messages.map((message) => message.messageId)) });
        }
      },
      send: async (body) => {
        try {
          await api.post('chat', body, AbortSignal.timeout(15_000), true);
          chatLog.reread();
          return true;
        } catch {
          return false;
        }
      },
    },
  };
}
