import { useEffect, useRef, useState } from 'react';

import { ApiError } from './client.ts';
import { useLiveRefresh } from './live-context.ts';

export type Resource<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error'; readonly message: string };

/**
 * The order of the reads of one generation. A read never replaces a newer read's value; a
 * foreground failure shows only while nothing newer has succeeded, and a background failure
 * never replaces what is shown.
 */
export class ReadOrder {
  #started = 0;
  #shown = 0;

  /** A ticket for a new read. */
  start(): number {
    return (this.#started += 1);
  }

  /** Whether a successful read may replace what is shown. */
  succeeded(ticket: number): boolean {
    if (ticket < this.#shown) return false;
    this.#shown = ticket;
    return true;
  }

  /** Whether a failed foreground read may show its error. */
  failed(ticket: number): boolean {
    return ticket > this.#shown;
  }
}

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'The world could not be loaded. Please try again.';

/**
 * A request owns one generation. Abort is an optimization; the live flag
 * rejects late success AND failure even when the transport ignores abort.
 * Key comparison hides old data during render, before effects run.
 *
 * Inside a live session each signal re-reads the same generation in the background
 * (docs/adr/0033-live-session.md §4): the shown value stays until the new one arrives, a
 * failed background read keeps it, and at most one background read runs at a time (a signal
 * meanwhile reads once more afterwards). Nothing is remounted, so drafts and selections stay.
 */
export function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const refresh = useLiveRefresh();
  const [attempt, setAttempt] = useState(0);
  const generation = `${key}:${attempt}`;
  const [stored, setStored] = useState<{ key: string; resource: Resource<T> } | null>(null);
  const background = useRef<(() => void) | null>(null);
  const seen = useRef(refresh);
  useEffect(() => {
    const controllers = new Set<AbortController>();
    const order = new ReadOrder();
    let live = true;
    let inFlight = false;
    let again = false;
    const read = async (inBackground: boolean) => {
      const controller = new AbortController();
      controllers.add(controller);
      const ticket = order.start();
      try {
        const value = await load(controller.signal);
        if (live && order.succeeded(ticket)) {
          setStored({ key: generation, resource: { status: 'ready', value } });
        }
      } catch (error) {
        if (live && !inBackground && order.failed(ticket)) {
          setStored({ key: generation, resource: { status: 'error', message: messageOf(error) } });
        }
      } finally {
        controllers.delete(controller);
      }
    };
    const reread = () => {
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      void read(true).finally(() => {
        inFlight = false;
        if (live && again) {
          again = false;
          reread();
        }
      });
    };
    // A signal that came with this generation is covered by its foreground read.
    seen.current = refresh;
    background.current = reread;
    void read(false);
    return () => {
      live = false;
      background.current = null;
      for (const controller of controllers) controller.abort();
    };
    // `refresh` is read once per generation, deliberately not a dependency.
  }, [generation, load]);
  useEffect(() => {
    if (seen.current === refresh) return;
    seen.current = refresh;
    background.current?.();
  }, [refresh]);
  return {
    resource: stored?.key === generation ? stored.resource : ({ status: 'loading' } as Resource<T>),
    retry: () => {
      setAttempt((current) => current + 1);
    },
  };
}
