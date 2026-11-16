import { CHEER_MS, MAX_CHEERS, type CheerMark } from '@ltw/contracts';

/**
 * The cheers a table holds (docs/adr/0072-keepsakes.md §3): this process's memory and nothing
 * else — no table, no file, no log line carries one. A cheer is held for `CHEER_MS` and then is
 * gone; a campaign holds `MAX_CHEERS` at most, the oldest giving way. The live application and
 * its fingerprint twin share one board (`live/live-app.ts`), so a cheer signals its readers.
 */
export interface Cheer {
  readonly cheerId: string;
  readonly mark: CheerMark;
  /** The character it is given as; null for the DM's own. */
  readonly characterId: string | null;
  /** When it was given, in the board's clock (milliseconds). */
  readonly at: number;
}

export class CheerBoard {
  readonly #held = new Map<string, Cheer[]>();

  /** The campaign's cheers still held at `now`, oldest first. */
  list(campaignId: string, now: number): readonly Cheer[] {
    const held = this.#fresh(campaignId, now);
    return held.map((cheer) => ({ ...cheer }));
  }

  /** Holds a cheer; false when its ID is held already (a retried request). */
  add(campaignId: string, cheer: Cheer): boolean {
    const held = this.#fresh(campaignId, cheer.at);
    if (held.some((one) => one.cheerId === cheer.cheerId)) return false;
    held.push({ ...cheer });
    this.#held.set(campaignId, held.slice(Math.max(0, held.length - MAX_CHEERS)));
    return true;
  }

  /** Campaigns with a cheer held or not yet swept: bounded by what the tables gave lately. */
  get campaigns(): number {
    return this.#held.size;
  }

  /** Drops what has aged out, and a campaign with nothing left. */
  #fresh(campaignId: string, now: number): Cheer[] {
    const held = (this.#held.get(campaignId) ?? []).filter((cheer) => now - cheer.at < CHEER_MS);
    if (held.length === 0) this.#held.delete(campaignId);
    else this.#held.set(campaignId, held);
    return held;
  }
}
