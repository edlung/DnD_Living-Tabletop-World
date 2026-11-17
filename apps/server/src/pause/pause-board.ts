import { PAUSE_AGAIN_MS, PAUSE_ASK_MS, PAUSE_SEEN_MS } from '@ltw/contracts';

/**
 * The requests for a pause a table holds (docs/adr/0073-table-ideas.md §2): this process's memory
 * and nothing else — no table, no file, no chat message, no log line carries one. One a character:
 * held until the DM has seen it and a moment longer (the asker reads that), or until it ages out.
 * The live application and its fingerprint twin share one board (`live/live-app.ts`), so a request
 * signals the DM and its own asker.
 */
export interface PauseAsk {
  readonly characterId: string;
  /** When it was asked, in the board's clock (milliseconds). */
  readonly askedAt: number;
  /** When the DM saw it; null while it waits. */
  readonly seenAt: number | null;
}

const held = (ask: PauseAsk, now: number): boolean =>
  ask.seenAt === null ? now - ask.askedAt < PAUSE_ASK_MS : now - ask.seenAt < PAUSE_SEEN_MS;

export class PauseBoard {
  readonly #asks = new Map<string, PauseAsk[]>();

  /** The campaign's requests still held at `now`, the first asked first. */
  list(campaignId: string, now: number): readonly PauseAsk[] {
    return this.#fresh(campaignId, now).map((ask) => ({ ...ask }));
  }

  /**
   * A character asks. False when it asked within the last while: the request stands as it was —
   * seen or not — and a second press is not a second request.
   */
  ask(campaignId: string, characterId: string, now: number): boolean {
    const asks = this.#fresh(campaignId, now);
    const mine = asks.find((ask) => ask.characterId === characterId);
    if (mine && now - mine.askedAt < PAUSE_AGAIN_MS) return false;
    this.#asks.set(campaignId, [
      ...asks.filter((ask) => ask.characterId !== characterId),
      { characterId, askedAt: now, seenAt: null },
    ]);
    return true;
  }

  /** The DM has seen a character's request; false when none waits. */
  seen(campaignId: string, characterId: string, now: number): boolean {
    let found = false;
    this.#asks.set(
      campaignId,
      this.#fresh(campaignId, now).map((ask) => {
        if (ask.characterId !== characterId || ask.seenAt !== null) return ask;
        found = true;
        return { ...ask, seenAt: now };
      }),
    );
    this.#fresh(campaignId, now);
    return found;
  }

  /** The game was paused: every waiting request has its answer. */
  seenAll(campaignId: string, now: number): void {
    for (const ask of this.#fresh(campaignId, now)) this.seen(campaignId, ask.characterId, now);
  }

  /** No session is open: nothing is left to ask a pause of. */
  clear(campaignId: string): void {
    this.#asks.delete(campaignId);
  }

  /** Campaigns with a request held or not yet swept. */
  get campaigns(): number {
    return this.#asks.size;
  }

  #fresh(campaignId: string, now: number): PauseAsk[] {
    const asks = (this.#asks.get(campaignId) ?? []).filter((ask) => held(ask, now));
    if (asks.length === 0) this.#asks.delete(campaignId);
    else this.#asks.set(campaignId, asks);
    return asks;
  }
}
