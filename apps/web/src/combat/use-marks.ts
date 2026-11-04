import type { MarkRequest, MarksResponse, MarkView, Square } from '@ltw/contracts';
import { useCallback, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useLiveRefresh } from '../api/live-context.ts';
import { useResource } from '../api/resource.ts';
import { useRereadOn } from '../world/use-world-data.ts';

/**
 * The table's shared marks as this screen reads them (docs/adr/0057-encounters-maps-loot.md §5):
 * read again whenever the live stream says they changed, and laid, cleared or opened to players
 * through the marks' routes; a mark that does not reach the table says so. The stage keeps them,
 * so the battlefield's fresh start after each own action neither loses nor replays them.
 */
export interface Marks {
  readonly value: ShownMarks | null;
  readonly failed: boolean;
  readonly lay: (mark: MarkInput) => void;
  readonly clear: () => void;
  readonly allow: (playersMayMark: boolean) => void;
}

export type MarkInput =
  | { readonly kind: 'ping' | 'pointer'; readonly square: Square }
  | { readonly kind: 'stroke' | 'area'; readonly squares: readonly Square[] };

/** A mark as a screen draws it: a ping carries when this screen first read it, by its own clock. */
export type ShownMark = MarkView & { readonly seenAt?: number };
export interface ShownMarks extends Omit<MarksResponse, 'marks'> {
  readonly marks: readonly ShownMark[];
}

/**
 * Reads the marks, noting when this screen first saw each ping: it fades `PING_MS` later by this
 * screen's clock, however far it is from the server's (which drops the ping on its own clock).
 */
export function marksReader() {
  const seen = new Map<string, number>();
  return async (api: WorldApi, signal: AbortSignal): Promise<ShownMarks> => {
    const read = await api.get<MarksResponse>('marks', signal);
    const now = Date.now();
    const pings = new Set<string>();
    const marks = read.marks.map((mark) => {
      if (mark.kind !== 'ping') return mark;
      const seenAt = seen.get(mark.markId) ?? now;
      seen.set(mark.markId, seenAt);
      pings.add(mark.markId);
      return { ...mark, seenAt };
    });
    for (const markId of seen.keys()) if (!pings.has(markId)) seen.delete(markId);
    return { ...read, marks };
  };
}

export function useMarks(api: WorldApi): Marks {
  const [reader] = useState(() => marksReader());
  const load = useCallback((signal: AbortSignal) => reader(api, signal), [api, reader]);
  const { resource, reread } = useResource('marks', load);
  useRereadOn(useLiveRefresh(), reread);
  const [failed, setFailed] = useState(false);
  // The DM's choice for the players shows at once; the first read that agrees takes over.
  const [asked, setAsked] = useState<boolean | null>(null);
  const read = resource.status === 'ready' ? resource.value : null;
  if (asked !== null && read?.playersMayMark === asked) setAsked(null);
  const send = (path: string, body: object, undo?: () => void) => {
    setFailed(false);
    api
      .post(path, body, AbortSignal.timeout(10_000), true)
      .then(reread)
      .catch(() => {
        undo?.();
        setFailed(true);
      });
  };
  return {
    value: read && asked !== null ? { ...read, playersMayMark: asked } : read,
    failed,
    lay: (mark) => {
      const markId = crypto.randomUUID();
      const body: MarkRequest =
        'square' in mark
          ? { kind: mark.kind, markId, square: { ...mark.square } }
          : { kind: mark.kind, markId, squares: mark.squares.map((square) => ({ ...square })) };
      send('marks', body);
    },
    clear: () => {
      send('marks/clear', {});
    },
    allow: (playersMayMark) => {
      setAsked(playersMayMark);
      send('marks/settings', { playersMayMark }, () => {
        setAsked(null);
      });
    },
  };
}
