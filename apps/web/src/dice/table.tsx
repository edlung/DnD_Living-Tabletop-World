import type {
  ChatLogResponse,
  ChatMessageRequest,
  CheckRequestInput,
  CheckRequestsResponse,
  RestResponse,
  RestView,
  RollEntry,
  RollFeedResponse,
  TableRollRequest,
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
  readonly busy: boolean;
  readonly error: string | null;
  readonly isDm: boolean;
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
  const chatLog = useResource('chat', loadChat);
  useRereadOn(revision, chatLog.reread);
  // Messages read on this screen: the first read is read, later ones by others wait to be seen.
  const [readUpTo, setReadUpTo] = useState<ReadonlySet<string> | null>(null);
  const messages = chatLog.resource.status === 'ready' ? chatLog.resource.value.messages : null;
  useEffect(() => {
    if (messages !== null && readUpTo === null) {
      setReadUpTo(new Set(messages.map((message) => message.messageId)));
    }
  }, [messages, readUpTo]);
  const unread =
    messages === null || readUpTo === null
      ? 0
      : messages.filter(
          (message) =>
            !readUpTo.has(message.messageId) &&
            !(isDm ? message.speaker === null : message.speaker?.entityId === characterId),
        ).length;
  const feed = useResource('rolls', loadFeed);
  const requests = useResource('check-requests', loadRequests);
  const rest = useResource('rest', loadRest);
  useRereadOn(revision, feed.reread);
  useRereadOn(revision, requests.reread);
  useRereadOn(revision, rest.reread);
  const [fresh, setFresh] = useState<readonly RollEntry[]>([]);
  const [flying, setFlying] = useState<ReadonlySet<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (feed.resource.status !== 'ready') return;
    const rolls = feed.resource.value.rolls;
    if (seen.current === null) {
      // The first read is the table as it was: nothing in it is thrown again.
      seen.current = new Set(rolls.map((roll) => roll.rollId));
      return;
    }
    const known = seen.current;
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
    async (path: string, body: unknown) => {
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
            ? t('That request was already answered or withdrawn.')
            : t('The dice could not be rolled. Try again.'),
        );
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
    busy,
    error,
    isDm,
    characterId,
    chat: {
      log: chatLog.resource,
      unread,
      markRead: () => {
        if (messages !== null) setReadUpTo(new Set(messages.map((message) => message.messageId)));
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
