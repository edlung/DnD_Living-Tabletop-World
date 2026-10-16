import { WindowCounter } from './window-counter.ts';

/**
 * Request limits (docs/adr/0036-production-sign-in.md §6 and its amendment 2026-10-16;
 * docs/STAGE_340_DESIGN.md "Limits"): in memory, per process (the alpha runs one instance),
 * answered with 429 and a fixed body. Every table is a bounded, time-bucketed counter
 * (`window-counter.ts`): rotating addresses or token prefixes cannot grow memory or slow a call.
 * Keys are held only here: client groups (`clientGroup`, an IPv4 address or an IPv6 /64) and
 * token prefixes never leave the process.
 */
export interface LimitSettings {
  /** Redeem attempts per client per minute, successful or not. */
  readonly redeemPerMinute: number;
  /** Failed redeems of one token prefix within `prefixWindowMs` before that prefix is refused. */
  readonly prefixFailures: number;
  readonly prefixWindowMs: number;
  /** Failed redeems per client per hour before the client is locked out. */
  readonly failuresPerHour: number;
  readonly lockoutMs: number;
  /**
   * Redeems refused, or still being decided, per minute across every client. Past it every
   * redeem waits for the next minute, so scripted guessing from many addresses stays bounded.
   */
  readonly refusedRedeemsPerMinute: number;
  /** Evidence rows of refused and limited redeems written per minute; the rest are not written. */
  readonly evidencePerMinute: number;
  /** AI (intents, NPC dialogue, Chronicle, AI ranking) and image requests per actor per minute. */
  readonly expensivePerMinute: number;
  /** Of those, at most this many in flight per actor. */
  readonly expensiveInFlight: number;
  /** Invitations a DM may create per hour. */
  readonly invitationsPerHour: number;
  /** Keys each table tracks at most (clients, token prefixes, actors, DMs). */
  readonly trackedKeys: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const SIGN_IN_LIMITS: LimitSettings = {
  redeemPerMinute: 10,
  prefixFailures: 5,
  prefixWindowMs: 15 * MINUTE,
  failuresPerHour: 20,
  lockoutMs: 15 * MINUTE,
  refusedRedeemsPerMinute: 60,
  evidencePerMinute: 30,
  expensivePerMinute: 20,
  expensiveInFlight: 2,
  invitationsPerHour: 20,
  trackedKeys: 10_000,
};

/** Characters of a presented token that key its failures. */
export const TOKEN_PREFIX_LENGTH = 8;

/** The one key of the process-wide counters. */
const EVERYONE = '*';

/** One admitted expensive request; release it exactly when its work is over. */
export interface Slot {
  release(): void;
}

/** Why a redeem was not admitted; for logs only, every refusal answers the same 429. */
export type RedeemRefusal = 'locked' | 'too-fast' | 'busy' | 'untracked';

/** One admitted redeem attempt: settle it once with its outcome. */
export interface RedeemAdmission {
  /** A failed redeem: counts toward the token prefix's refusal and the client's lockout. */
  failed(prefix: string | null): void;
  /** Not a refused guess (it signed in, or waits for the browser's confirmation). */
  settled(): void;
}

export type EvidenceOutcome = 'redeemed' | 'refused' | 'limited';

export class RequestLimits {
  readonly #settings: LimitSettings;
  readonly #now: () => number;
  readonly #attempts: WindowCounter;
  readonly #prefixes: WindowCounter;
  readonly #failures: WindowCounter;
  readonly #refusals: WindowCounter;
  readonly #evidence: WindowCounter;
  readonly #limitedEvidence: WindowCounter;
  readonly #expensive: WindowCounter;
  readonly #inFlight = new Map<string, number>();
  readonly #invitations: WindowCounter;

  constructor(settings: LimitSettings, now: () => number) {
    this.#settings = settings;
    this.#now = now;
    const maxKeys = settings.trackedKeys;
    const per = (limit: number, windowMs: number) =>
      new WindowCounter({ limit, windowMs, maxKeys });
    const everyone = (limit: number) => new WindowCounter({ limit, windowMs: MINUTE, maxKeys: 1 });
    this.#attempts = per(settings.redeemPerMinute, MINUTE);
    this.#prefixes = per(settings.prefixFailures, settings.prefixWindowMs);
    this.#failures = per(settings.failuresPerHour, HOUR);
    this.#refusals = everyone(settings.refusedRedeemsPerMinute);
    this.#evidence = everyone(settings.evidencePerMinute);
    this.#limitedEvidence = per(1, MINUTE);
    this.#expensive = per(settings.expensivePerMinute, MINUTE);
    this.#invitations = per(settings.invitationsPerHour, HOUR);
  }

  /** Keys tracked now across every table (memory is bounded by `trackedKeys` per table). */
  tracked(): number {
    return [
      this.#attempts,
      this.#prefixes,
      this.#failures,
      this.#limitedEvidence,
      this.#expensive,
      this.#invitations,
    ].reduce((total, table) => total + table.size, 0);
  }

  /**
   * Admits one redeem attempt from a client, or says why not: locked out, too fast, every
   * client's refusals over budget this minute, or a client the full tables cannot follow (a
   * redeem fails closed rather than go uncounted; everything else keeps working).
   */
  redeemAttempt(client: string): RedeemAdmission | RedeemRefusal {
    const now = this.#now();
    if (this.#lockedOut(client, now)) return 'locked';
    if (this.#refusals.count(EVERYONE, now) >= this.#settings.refusedRedeemsPerMinute) {
      return 'busy';
    }
    if (!this.#failures.accepts(client, now)) return 'untracked';
    const taken = this.#attempts.take(client, now);
    if (taken !== 'taken') return taken === 'limited' ? 'too-fast' : 'untracked';
    // Counted as refused until it proves otherwise, so concurrent guesses share the budget too.
    this.#refusals.add(EVERYONE, now);
    return this.#admission(client, now);
  }

  /** False once a token prefix failed too often recently, or the full table cannot follow it. */
  prefixAllowed(prefix: string): boolean {
    const now = this.#now();
    return (
      this.#prefixes.accepts(prefix, now) &&
      this.#prefixes.count(prefix, now) < this.#settings.prefixFailures
    );
  }

  /**
   * Whether a redeem's evidence row may be written now. Successful redeems always are (each
   * spends an invitation); refused and limited ones share `evidencePerMinute`, and a limited
   * client is written at most once a minute, so a flood of refusals never floods the database.
   */
  evidence(client: string, outcome: EvidenceOutcome): boolean {
    if (outcome === 'redeemed') return true;
    const now = this.#now();
    if (this.#evidence.count(EVERYONE, now) >= this.#settings.evidencePerMinute) return false;
    if (outcome === 'limited' && this.#limitedEvidence.take(client, now) !== 'taken') return false;
    return this.#evidence.take(EVERYONE, now) === 'taken';
  }

  /** Admits one AI or image request of `actorKey`, or null over the rate or in-flight cap. */
  expensive(actorKey: string): Slot | null {
    const busy = this.#inFlight.get(actorKey) ?? 0;
    if (busy >= this.#settings.expensiveInFlight) return null;
    if (this.#expensive.take(actorKey, this.#now()) !== 'taken') return null;
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
    return this.#invitations.take(dmKey, this.#now()) === 'taken';
  }

  /** Locked out: `failuresPerHour` failures, the latest less than `lockoutMs` ago. */
  #lockedOut(client: string, now: number): boolean {
    if (this.#failures.count(client, now) < this.#settings.failuresPerHour) return false;
    const latest = this.#failures.latest(client);
    return latest !== null && now - latest < this.#settings.lockoutMs;
  }

  #admission(client: string, at: number): RedeemAdmission {
    let open = true;
    return {
      failed: (prefix) => {
        if (!open) return;
        open = false;
        const now = this.#now();
        if (prefix !== null) this.#prefixes.add(prefix, now);
        this.#failures.add(client, now);
      },
      settled: () => {
        if (!open) return;
        open = false;
        this.#refusals.untake(EVERYONE, at);
      },
    };
  }
}
