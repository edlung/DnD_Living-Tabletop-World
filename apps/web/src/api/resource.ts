import { useEffect, useRef, useState } from 'react';

import { ApiError } from './client.ts';
import { TRAILING_REREAD_MS, useLiveActive, useLiveRefresh } from './live-context.ts';

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

type ReadKind = 'foreground' | 'background' | 'trailing';

/**
 * The reads of one generation (docs/adr/0033-live-session.md §4). The first read is in the
 * foreground: its failure shows while nothing newer has succeeded. Every later read is in the
 * background: the shown value stays until a newer one arrives, a failure keeps it, and at most
 * one runs at a time (a request meanwhile reads once more afterwards).
 *
 * Inside a live session every read is followed by one trailing background read,
 * `TRAILING_REREAD_MS` after it completed: a change undone within one comparison cycle never
 * reaches the fingerprint, so no signal would correct a read that saw the state in between,
 * whatever caused that read (the first load, a signal, the viewer's own action). A newer read
 * replaces a pending trailing read (its own completion schedules the next one), and a trailing
 * read schedules none, so a quiet screen stops reading. Closing ends it all.
 */
export class GenerationReads<T> {
  readonly #load: (signal: AbortSignal) => Promise<T>;
  readonly #show: (resource: Resource<T>) => void;
  readonly #live: boolean;
  readonly #order = new ReadOrder();
  readonly #controllers = new Set<AbortController>();
  #open = true;
  #running = false;
  #queued: Exclude<ReadKind, 'foreground'> | null = null;
  #trailing: ReturnType<typeof setTimeout> | undefined;

  constructor(options: {
    readonly load: (signal: AbortSignal) => Promise<T>;
    readonly show: (resource: Resource<T>) => void;
    /** Inside a live session: reads are followed by a trailing read. */
    readonly live: boolean;
  }) {
    this.#load = options.load;
    this.#show = options.show;
    this.#live = options.live;
  }

  /** The generation's first read. */
  start(): void {
    void this.#read('foreground');
  }

  /** A background read now: after a signal, or after the viewer's own action. */
  reread(): void {
    this.#background('background');
  }

  /** Ends the generation: nothing more is read, and no answer is shown. */
  close(): void {
    this.#open = false;
    clearTimeout(this.#trailing);
    for (const controller of this.#controllers) controller.abort();
  }

  #background(kind: Exclude<ReadKind, 'foreground'>): void {
    if (!this.#open) return;
    if (this.#running) {
      // A requested read covers a trailing one: it is followed by its own.
      if (this.#queued !== 'background') this.#queued = kind;
      return;
    }
    this.#running = true;
    void this.#read(kind).finally(() => {
      this.#running = false;
      const next = this.#queued;
      this.#queued = null;
      if (next !== null) this.#background(next);
    });
  }

  async #read(kind: ReadKind): Promise<void> {
    if (kind !== 'trailing') clearTimeout(this.#trailing);
    const controller = new AbortController();
    this.#controllers.add(controller);
    const ticket = this.#order.start();
    try {
      const value = await this.#load(controller.signal);
      if (this.#open && this.#order.succeeded(ticket)) this.#show({ status: 'ready', value });
    } catch (error) {
      if (this.#open && kind === 'foreground' && this.#order.failed(ticket)) {
        this.#show({ status: 'error', message: messageOf(error) });
      }
    } finally {
      this.#controllers.delete(controller);
      if (this.#open && this.#live && kind !== 'trailing') {
        clearTimeout(this.#trailing);
        this.#trailing = setTimeout(() => {
          this.#background('trailing');
        }, TRAILING_REREAD_MS);
      }
    }
  }
}

/**
 * A request owns one generation. Abort is an optimization; closing the generation rejects late
 * success AND failure even when the transport ignores abort. Key comparison hides old data
 * during render, before effects run.
 *
 * Inside a live session each signal re-reads the same generation in the background, and every
 * read is followed by one trailing read (`GenerationReads`). Nothing is remounted, so drafts and
 * selections stay.
 */
export function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const refresh = useLiveRefresh();
  const active = useLiveActive();
  const [attempt, setAttempt] = useState(0);
  const generation = `${key}:${attempt}`;
  const [stored, setStored] = useState<{ key: string; resource: Resource<T> } | null>(null);
  const reads = useRef<GenerationReads<T> | null>(null);
  const seen = useRef(refresh);
  useEffect(() => {
    const current = new GenerationReads({
      load,
      show: (resource: Resource<T>) => {
        setStored({ key: generation, resource });
      },
      live: active,
    });
    // A signal that came with this generation is covered by its foreground read.
    seen.current = refresh;
    reads.current = current;
    current.start();
    return () => {
      current.close();
      reads.current = null;
    };
    // `refresh` is read once per generation, deliberately not a dependency.
  }, [generation, load, active]);
  useEffect(() => {
    if (seen.current === refresh) return;
    seen.current = refresh;
    reads.current?.reread();
  }, [refresh]);
  return {
    resource: stored?.key === generation ? stored.resource : ({ status: 'loading' } as Resource<T>),
    retry: () => {
      setAttempt((current) => current + 1);
    },
    /**
     * A background re-read now (after the viewer's own action): what is shown stays meanwhile,
     * and a trailing read follows as for any read.
     */
    reread: () => {
      reads.current?.reread();
    },
  };
}
