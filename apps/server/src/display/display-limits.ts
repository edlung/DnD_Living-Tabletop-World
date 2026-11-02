import { WindowCounter } from '../auth/window-counter.ts';

/**
 * Limits of displays and table links (docs/adr/0042-table-display.md §6), in memory and per
 * process like every sign-in limit: pairing requests per client group, the DM's typed codes per
 * DM, a table code's failures and a table seat's invitations per client group. A full table
 * refuses (fail closed).
 */
const MINUTE = 60_000;

export interface DisplayLimitSettings {
  readonly pairingsPerMinute: number;
  readonly dmCodesPerMinute: number;
  readonly tableFailuresPerMinute: number;
  readonly tableSeatsPerMinute: number;
  readonly trackedKeys: number;
}

export const DISPLAY_LIMITS: DisplayLimitSettings = {
  pairingsPerMinute: 10,
  dmCodesPerMinute: 10,
  tableFailuresPerMinute: 5,
  tableSeatsPerMinute: 10,
  trackedKeys: 10_000,
};

export class DisplayLimits {
  readonly #now: () => number;
  readonly #pairings: WindowCounter;
  readonly #dmCodes: WindowCounter;
  readonly #tableFailures: WindowCounter;
  readonly #tableSeats: WindowCounter;
  readonly #tableFailureLimit: number;

  constructor(settings: DisplayLimitSettings, now: () => number) {
    this.#now = now;
    const counter = (limit: number) =>
      new WindowCounter({ limit, windowMs: MINUTE, maxKeys: settings.trackedKeys });
    this.#pairings = counter(settings.pairingsPerMinute);
    this.#dmCodes = counter(settings.dmCodesPerMinute);
    this.#tableFailures = counter(settings.tableFailuresPerMinute);
    this.#tableSeats = counter(settings.tableSeatsPerMinute);
    this.#tableFailureLimit = settings.tableFailuresPerMinute;
  }

  pairing(client: string): boolean {
    return this.#pairings.take(client, this.#now()) === 'taken';
  }

  dmCode(dmKey: string): boolean {
    return this.#dmCodes.take(dmKey, this.#now()) === 'taken';
  }

  /** Whether a client may try a table code or link now (its failures are not spent). */
  tableTry(client: string): boolean {
    const now = this.#now();
    return (
      this.#tableFailures.count(client, now) < this.#tableFailureLimit &&
      this.#tableFailures.accepts(client, now)
    );
  }

  tableFailed(client: string): void {
    this.#tableFailures.add(client, this.#now());
  }

  tableSeat(client: string): boolean {
    return this.#tableSeats.take(client, this.#now()) === 'taken';
  }
}
