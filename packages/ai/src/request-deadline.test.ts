import { afterEach, describe, expect, it, vi } from 'vitest';

import { EXPIRED, isExpired, openDeadline, untilDeadline } from './request-deadline.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('caller-linked whole-request deadline', () => {
  it('forwards an existing cancellation synchronously', () => {
    const caller = new AbortController();
    caller.abort();
    const opened = openDeadline(1000, caller.signal);
    expect(opened.deadline.signal.aborted).toBe(true);
    expect(isExpired(opened.deadline)).toBe(true);
    opened.close();
  });

  it('ends a pending wait as soon as the caller aborts, without waiting for the duration', async () => {
    const caller = new AbortController();
    const opened = openDeadline(60_000, caller.signal);
    const waiting = untilDeadline(new Promise<never>(() => undefined), opened.deadline);
    caller.abort();
    expect(await waiting).toBe(EXPIRED);
    opened.close();
  });

  it('removes the caller listener and timer on close without cancelling its caller', () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const added = vi.spyOn(caller.signal, 'addEventListener');
    const removed = vi.spyOn(caller.signal, 'removeEventListener');
    const opened = openDeadline(1000, caller.signal);
    expect(vi.getTimerCount()).toBe(1);
    expect(added).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    opened.close();
    expect(removed).toHaveBeenCalledWith('abort', added.mock.calls[0]?.[1]);
    expect(vi.getTimerCount()).toBe(0);
    expect(opened.deadline.signal.aborted).toBe(true);
    expect(caller.signal.aborted).toBe(false);
  });

  it('keeps the timeout when no caller cancellation arrives', async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const opened = openDeadline(1000, caller.signal);
    const pending = untilDeadline(new Promise<never>(() => undefined), opened.deadline);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBe(EXPIRED);
    expect(caller.signal.aborted).toBe(false);
    opened.close();
  });
});
