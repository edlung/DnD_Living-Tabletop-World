import type { RecordedEvent } from '../kernel/events.ts';

/**
 * A bounded memory of views derived from one history (Gate 06 review: a scene's N pictures cost N
 * full replays of the campaign, one per content request). The World Engine hands out one frozen
 * history array per campaign version, so entries keyed on it are dropped with that version (a
 * `WeakMap`); each history keeps at most `MEMO_LIMIT` entries, the least recently used dropped
 * first. A history that is not frozen may still grow in place, so nothing is remembered for it.
 */
export const MEMO_LIMIT = 16;

const memos = new WeakMap<readonly RecordedEvent[], Map<string, unknown>>();

export function remembered<T>(history: readonly RecordedEvent[], key: string, make: () => T): T {
  if (!Object.isFrozen(history)) return make();
  let memo = memos.get(history);
  if (!memo) {
    memo = new Map();
    memos.set(history, memo);
  }
  if (memo.has(key)) {
    const value = memo.get(key) as T;
    // Most recently used last.
    memo.delete(key);
    memo.set(key, value);
    return value;
  }
  const value = make();
  memo.set(key, value);
  if (memo.size > MEMO_LIMIT) memo.delete(memo.keys().next().value as string);
  return value;
}
