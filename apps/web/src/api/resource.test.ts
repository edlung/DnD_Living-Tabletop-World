import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TRAILING_REREAD_MS } from './live-context.ts';
import { GenerationReads, ReadOrder, type Resource } from './resource.ts';

/**
 * Background re-reads of one generation (docs/adr/0033-live-session.md §4): late and
 * out-of-order answers never replace newer data, and a failure never hides a value.
 */
describe('the order of reads', () => {
  it('lets a newer success replace an older one, never the reverse', () => {
    const order = new ReadOrder();
    const foreground = order.start();
    const background = order.start();
    expect(order.succeeded(background)).toBe(true);
    // The foreground answer arrives late: it is older than what is shown.
    expect(order.succeeded(foreground)).toBe(false);
    const next = order.start();
    expect(order.succeeded(next)).toBe(true);
  });

  it('shows a foreground failure only while nothing newer succeeded', () => {
    const failing = new ReadOrder();
    expect(failing.failed(failing.start())).toBe(true);

    const recovered = new ReadOrder();
    const foreground = recovered.start();
    expect(recovered.succeeded(recovered.start())).toBe(true);
    expect(recovered.failed(foreground)).toBe(false);
  });

  it('accepts a duplicate answer of the shown read', () => {
    const order = new ReadOrder();
    const ticket = order.start();
    expect(order.succeeded(ticket)).toBe(true);
    expect(order.succeeded(ticket)).toBe(true);
  });
});

/**
 * The trailing read: a change undone within one comparison cycle raises no signal, so in a
 * live session every read, whatever caused it, is followed by one more a cycle after it
 * completed. The trailing read itself is followed by none.
 */
describe('the reads of a generation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  interface Pending {
    readonly signal: AbortSignal;
    resolve(value: number): void;
    reject(error: unknown): void;
  }

  /** A generation whose reads answer when the test says. */
  function generation(live = true) {
    const reads: Pending[] = [];
    const shown: Resource<number>[] = [];
    const reader = new GenerationReads<number>({
      load: (signal) =>
        new Promise<number>((resolve, reject) => {
          reads.push({ signal, resolve, reject });
        }),
      show: (resource) => shown.push(resource),
      live,
    });
    /** Answers the newest read and lets the answer land. */
    const answer = async (value: number) => {
      reads.at(-1)?.resolve(value);
      await vi.advanceTimersByTimeAsync(0);
    };
    return { reader, reads, shown, answer };
  }

  const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

  it('follows the first load with one trailing read, timed from its completion', async () => {
    const { reader, reads, shown, answer } = generation();
    reader.start();
    expect(reads).toHaveLength(1);
    // A slow first load: nothing trails while it is still being read.
    await wait(TRAILING_REREAD_MS * 2);
    expect(reads).toHaveLength(1);
    await answer(1);
    expect(shown).toEqual([{ status: 'ready', value: 1 }]);
    await wait(TRAILING_REREAD_MS - 1);
    expect(reads).toHaveLength(1);
    await wait(1);
    expect(reads).toHaveLength(2);
    await answer(2);
    expect(shown.at(-1)).toEqual({ status: 'ready', value: 2 });
  });

  it('follows a signalled read with its own trailing read, and never chains them', async () => {
    const { reader, reads, answer } = generation();
    reader.start();
    await answer(1);
    await wait(TRAILING_REREAD_MS);
    await answer(2);
    // The trailing read is followed by none: a quiet screen stops reading.
    await wait(TRAILING_REREAD_MS * 10);
    expect(reads).toHaveLength(2);

    reader.reread();
    expect(reads).toHaveLength(3);
    await wait(TRAILING_REREAD_MS * 2);
    await answer(3);
    await wait(TRAILING_REREAD_MS - 1);
    expect(reads).toHaveLength(3);
    await wait(1);
    expect(reads).toHaveLength(4);
    await answer(4);
    await wait(TRAILING_REREAD_MS * 10);
    expect(reads).toHaveLength(4);
  });

  it('lets a newer read replace a pending trailing read', async () => {
    const { reader, reads, answer } = generation();
    reader.start();
    await answer(1);
    await wait(TRAILING_REREAD_MS - 500);
    reader.reread();
    expect(reads).toHaveLength(2);
    // The first load's trailing read would be due now: the newer read replaced it.
    await wait(1_000);
    expect(reads).toHaveLength(2);
    await answer(2);
    await wait(TRAILING_REREAD_MS);
    expect(reads).toHaveLength(3);
  });

  it('keeps what is shown through background reads and their failures, one at a time', async () => {
    const { reader, reads, shown, answer } = generation();
    reader.start();
    await answer(1);
    reader.reread();
    reader.reread();
    reader.reread();
    // One background read at a time; the requests meanwhile read once more afterwards.
    expect(reads).toHaveLength(2);
    reads[1]?.reject(new Error('down'));
    await wait(0);
    expect(shown).toEqual([{ status: 'ready', value: 1 }]);
    expect(reads).toHaveLength(3);
    await answer(3);
    expect(shown).toEqual([
      { status: 'ready', value: 1 },
      { status: 'ready', value: 3 },
    ]);
  });

  it('ends with its generation: no trailing read, and no late answer shown', async () => {
    const done = generation();
    done.reader.start();
    await done.answer(1);
    done.reader.close();
    await wait(TRAILING_REREAD_MS * 10);
    expect(done.reads).toHaveLength(1);

    const pending = generation();
    pending.reader.start();
    pending.reader.close();
    expect(pending.reads[0]?.signal.aborted).toBe(true);
    await pending.answer(1);
    await wait(TRAILING_REREAD_MS * 10);
    expect(pending.shown).toEqual([]);
    expect(pending.reads).toHaveLength(1);
  });

  it('reads nothing on its own outside a live session', async () => {
    const { reader, reads, answer } = generation(false);
    reader.start();
    await answer(1);
    await wait(TRAILING_REREAD_MS * 10);
    expect(reads).toHaveLength(1);
    reader.reread();
    await answer(2);
    await wait(TRAILING_REREAD_MS * 10);
    expect(reads).toHaveLength(2);
  });
});
