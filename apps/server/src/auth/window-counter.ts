/**
 * Events per key within a sliding window, counted in fixed slices of time
 * (docs/adr/0036-production-sign-in.md, amendment 2026-10-16).
 *
 * - Bounded: at most `maxKeys` keys, each a fixed ring of slice counts. A key the table cannot
 *   take is answered `untracked`, and the caller decides what that means (redeems fail closed).
 * - Cheap: a call costs O(slices) plus at most `EVICTIONS_PER_CALL` evictions. Keys are kept in
 *   the order of their latest event, so only the oldest are ever looked at; there is no sweep.
 * - Never more permissive than the limit: an event counts for at least the whole window and at
 *   most one slice longer.
 */
export type Take = 'taken' | 'limited' | 'untracked';

export interface WindowSettings {
  readonly limit: number;
  readonly windowMs: number;
  readonly maxKeys: number;
  /** Slices per window (default 12): an event outlives the window by at most one of them. */
  readonly slices?: number;
}

interface Entry {
  /** The slice of the latest event. */
  slice: number;
  /** The time of the latest event. */
  at: number;
  /** Counts of the latest `slices + 1` slices, by slice number modulo the ring. */
  readonly counts: number[];
}

/** Expired keys removed per call at most, from the oldest end. */
const EVICTIONS_PER_CALL = 4;

export class WindowCounter {
  readonly #limit: number;
  readonly #sliceMs: number;
  readonly #slices: number;
  readonly #ring: number;
  readonly #maxKeys: number;
  /** Insertion order is the order of each key's latest event: the oldest first. */
  readonly #entries = new Map<string, Entry>();

  constructor(settings: WindowSettings) {
    this.#limit = settings.limit;
    this.#slices = settings.slices ?? 12;
    this.#ring = this.#slices + 1;
    this.#sliceMs = settings.windowMs / this.#slices;
    this.#maxKeys = settings.maxKeys;
  }

  /** Keys tracked now. */
  get size(): number {
    return this.#entries.size;
  }

  /** Events of `key` counted at `now`. */
  count(key: string, now: number): number {
    const entry = this.#entries.get(key);
    return entry === undefined ? 0 : this.#sum(entry, this.#sliceOf(now));
  }

  /** The time of the latest event of `key` still tracked, or null. */
  latest(key: string): number | null {
    return this.#entries.get(key)?.at ?? null;
  }

  /** Whether `key` is tracked, or there is room to track it. */
  accepts(key: string, now: number): boolean {
    this.#evict(this.#sliceOf(now));
    return this.#entries.has(key) || this.#entries.size < this.#maxKeys;
  }

  /** Records one event unless the window is full (`limited`) or the key cannot be tracked. */
  take(key: string, now: number): Take {
    const current = this.#sliceOf(now);
    const entry = this.#tracked(key, current, now);
    if (entry === null) return 'untracked';
    if (this.#sum(entry, current) >= this.#limit) return 'limited';
    this.#record(key, entry, current, now);
    return 'taken';
  }

  /** Records one event whatever the count (failures): the count after it, or null if untracked. */
  add(key: string, now: number): number | null {
    const current = this.#sliceOf(now);
    const entry = this.#tracked(key, current, now);
    if (entry === null) return null;
    this.#record(key, entry, current, now);
    return this.#sum(entry, current);
  }

  /** Takes back one event recorded at `at` (a refund), while its slice is still counted. */
  untake(key: string, at: number): void {
    const entry = this.#entries.get(key);
    const slice = this.#sliceOf(at);
    if (entry === undefined || slice > entry.slice || slice < entry.slice - this.#slices) return;
    const slot = this.#slot(slice);
    if ((entry.counts[slot] ?? 0) > 0) entry.counts[slot] = (entry.counts[slot] ?? 0) - 1;
  }

  #sliceOf(now: number): number {
    return Math.floor(now / this.#sliceMs);
  }

  #slot(slice: number): number {
    return ((slice % this.#ring) + this.#ring) % this.#ring;
  }

  /** The entry of `key`, a new one if there is room for it, or null. */
  #tracked(key: string, current: number, now: number): Entry | null {
    this.#evict(current);
    const entry = this.#entries.get(key);
    if (entry !== undefined) return entry;
    if (this.#entries.size >= this.#maxKeys) return null;
    return { slice: current, at: now, counts: Array.from({ length: this.#ring }, () => 0) };
  }

  /** Events of slices `current - slices` to `current` (the latest slice if the clock went back). */
  #sum(entry: Entry, current: number): number {
    const first = Math.max(current, entry.slice) - this.#slices;
    let total = 0;
    for (let slice = entry.slice; slice >= first && slice > entry.slice - this.#ring; slice -= 1) {
      total += entry.counts[this.#slot(slice)] ?? 0;
    }
    return total;
  }

  #record(key: string, entry: Entry, current: number, now: number): void {
    const target = Math.max(current, entry.slice);
    // Slots of slices that passed since the latest event start again from zero.
    const passed = Math.min(target - entry.slice, this.#ring);
    for (let step = 1; step <= passed; step += 1) {
      entry.counts[this.#slot(entry.slice + step)] = 0;
    }
    entry.slice = target;
    entry.at = Math.max(entry.at, now);
    const slot = this.#slot(target);
    entry.counts[slot] = (entry.counts[slot] ?? 0) + 1;
    // The newest event moves its key to the end.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
  }

  /** Removes up to `EVICTIONS_PER_CALL` keys, oldest first, whose events are all uncounted. */
  #evict(current: number): void {
    let left = EVICTIONS_PER_CALL;
    for (const [key, entry] of this.#entries) {
      if (left === 0 || current - entry.slice <= this.#slices) return;
      this.#entries.delete(key);
      left -= 1;
    }
  }
}
