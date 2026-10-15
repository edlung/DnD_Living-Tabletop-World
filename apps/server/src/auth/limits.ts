/**
 * Request limits (docs/adr/0036-production-sign-in.md §6; docs/STAGE_340_DESIGN.md "Limits"):
 * in memory, per process (the alpha runs one instance), answered with 429 and a fixed body.
 * Keys are held only here: IP addresses and token prefixes never leave the process.
 */
export interface LimitSettings {
  /** Redeem attempts per IP address per minute, successful or not. */
  readonly redeemPerMinute: number;
  /** Failed redeems of one token prefix within `prefixWindowMs` before that prefix is refused. */
  readonly prefixFailures: number;
  readonly prefixWindowMs: number;
  /** Failed redeems per IP address per hour before the address is locked out. */
  readonly failuresPerHour: number;
  readonly lockoutMs: number;
  /** AI (intents, NPC dialogue, Chronicle) and image requests per actor per minute. */
  readonly expensivePerMinute: number;
  /** Of those, at most this many in flight per actor. */
  readonly expensiveInFlight: number;
  /** Invitations a DM may create per hour. */
  readonly invitationsPerHour: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const SIGN_IN_LIMITS: LimitSettings = {
  redeemPerMinute: 10,
  prefixFailures: 5,
  prefixWindowMs: 15 * MINUTE,
  failuresPerHour: 20,
  lockoutMs: 15 * MINUTE,
  expensivePerMinute: 20,
  expensiveInFlight: 2,
  invitationsPerHour: 20,
};

/** Characters of a presented token that key its failures. */
export const TOKEN_PREFIX_LENGTH = 8;

/** Keys beyond which a window sweeps out every key whose events all expired. */
const SWEEP_AT = 10_000;

/** Events per key within a sliding window. */
export class SlidingWindow {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #events = new Map<string, number[]>();

  constructor(limit: number, windowMs: number) {
    this.#limit = limit;
    this.#windowMs = windowMs;
  }

  /** Events of `key` still inside the window at `now`. */
  count(key: string, now: number): number {
    return this.#recent(key, now).length;
  }

  /** Records one event unless the window is full; whether it was recorded. */
  take(key: string, now: number): boolean {
    const recent = this.#recent(key, now);
    if (recent.length >= this.#limit) return false;
    this.#keep(key, [...recent, now], now);
    return true;
  }

  /** Records one event whatever the count (failures), keeping at most the limit's worth. */
  add(key: string, now: number): number {
    const recent = [...this.#recent(key, now), now].slice(-this.#limit);
    this.#keep(key, recent, now);
    return recent.length;
  }

  #recent(key: string, now: number): number[] {
    const events = this.#events.get(key) ?? [];
    const recent = events.filter((at) => now - at < this.#windowMs);
    if (recent.length === 0) this.#events.delete(key);
    else if (recent.length !== events.length) this.#events.set(key, recent);
    return recent;
  }

  #keep(key: string, events: number[], now: number): void {
    this.#events.set(key, events);
    if (this.#events.size <= SWEEP_AT) return;
    for (const [other, at] of this.#events) {
      if (at.every((time) => now - time >= this.#windowMs)) this.#events.delete(other);
    }
  }
}

/** One admitted expensive request; release it exactly when its work is over. */
export interface Slot {
  release(): void;
}

export class RequestLimits {
  readonly #settings: LimitSettings;
  readonly #now: () => number;
  readonly #redeems: SlidingWindow;
  readonly #prefixes: SlidingWindow;
  readonly #failures: SlidingWindow;
  readonly #lockedUntil = new Map<string, number>();
  readonly #expensive: SlidingWindow;
  readonly #inFlight = new Map<string, number>();
  readonly #invitations: SlidingWindow;
  readonly #limitedEvidence = new SlidingWindow(1, MINUTE);

  constructor(settings: LimitSettings, now: () => number) {
    this.#settings = settings;
    this.#now = now;
    this.#redeems = new SlidingWindow(settings.redeemPerMinute, MINUTE);
    this.#prefixes = new SlidingWindow(settings.prefixFailures, settings.prefixWindowMs);
    this.#failures = new SlidingWindow(settings.failuresPerHour, HOUR);
    this.#expensive = new SlidingWindow(settings.expensivePerMinute, MINUTE);
    this.#invitations = new SlidingWindow(settings.invitationsPerHour, HOUR);
  }

  /** Counts one redeem attempt from `ip`; false while the address is locked out or too fast. */
  redeemAttempt(ip: string): boolean {
    const now = this.#now();
    const until = this.#lockedUntil.get(ip);
    if (until !== undefined) {
      if (now < until) return false;
      this.#lockedUntil.delete(ip);
    }
    return this.#redeems.take(ip, now);
  }

  /** False once a token prefix failed too often recently. */
  prefixAllowed(prefix: string): boolean {
    return this.#prefixes.count(prefix, this.#now()) < this.#settings.prefixFailures;
  }

  /** A failed redeem: counts toward the prefix refusal and the address's lockout. */
  redeemFailed(ip: string, prefix: string | null): void {
    const now = this.#now();
    if (prefix !== null) this.#prefixes.add(prefix, now);
    if (this.#failures.add(ip, now) >= this.#settings.failuresPerHour) {
      this.#lockedUntil.set(ip, now + this.#settings.lockoutMs);
      if (this.#lockedUntil.size > SWEEP_AT) {
        for (const [address, until] of this.#lockedUntil) {
          if (until <= now) this.#lockedUntil.delete(address);
        }
      }
    }
  }

  /**
   * Whether a refused attempt from `ip` may be written as evidence now: at most once a minute
   * per address, so a flood of refusals never becomes a flood of database writes.
   */
  limitedEvidence(ip: string): boolean {
    return this.#limitedEvidence.take(ip, this.#now());
  }

  /** Admits one AI or image request of `actorKey`, or null over the rate or in-flight cap. */
  expensive(actorKey: string): Slot | null {
    const busy = this.#inFlight.get(actorKey) ?? 0;
    if (busy >= this.#settings.expensiveInFlight) return null;
    if (!this.#expensive.take(actorKey, this.#now())) return null;
    this.#inFlight.set(actorKey, busy + 1);
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        const left = (this.#inFlight.get(actorKey) ?? 1) - 1;
        if (left > 0) this.#inFlight.set(actorKey, left);
        else this.#inFlight.delete(actorKey);
      },
    };
  }

  /** Counts one invitation of `dmKey`; false over the hourly limit. */
  invitation(dmKey: string): boolean {
    return this.#invitations.take(dmKey, this.#now());
  }
}
