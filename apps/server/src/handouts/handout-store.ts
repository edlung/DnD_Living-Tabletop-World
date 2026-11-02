/**
 * Handouts (docs/adr/0044-online-play.md §5; migration 0032): append-only, beside the world. The
 * in-memory store is the reference semantics for the PostgreSQL one.
 */
export interface HandoutRecord {
  readonly campaignId: string;
  readonly handoutId: string;
  /** The character whose player it is for; null for the party. */
  readonly recipientId: string | null;
  readonly title: string;
  readonly text: string | null;
  /** The entity whose approved picture it shows. */
  readonly entityId: string | null;
  readonly at: string;
}

export interface HandoutStore {
  add(record: HandoutRecord): Promise<void>;
  /** The latest handouts of a campaign, oldest first. */
  recent(campaignId: string, limit: number): Promise<readonly HandoutRecord[]>;
}

export class InMemoryHandoutStore implements HandoutStore {
  readonly #handouts: HandoutRecord[] = [];

  add(record: HandoutRecord): Promise<void> {
    this.#handouts.push(record);
    return Promise.resolve();
  }

  recent(campaignId: string, limit: number): Promise<readonly HandoutRecord[]> {
    return Promise.resolve(
      this.#handouts.filter((handout) => handout.campaignId === campaignId).slice(-limit),
    );
  }
}
