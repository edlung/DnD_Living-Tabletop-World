import { MAX_SAVED_ENCOUNTERS, type SavedEncounterRequest } from '@ltw/contracts';

/**
 * The DM's saved encounters (docs/adr/0057-encounters-maps-loot.md §1; migration 0034): the DM's
 * preparation beside the world, never canonical and never a player's to read. The in-memory store
 * is the reference semantics for the PostgreSQL one. A deleted encounter is gone.
 */
export interface SavedEncounterRecord {
  readonly campaignId: string;
  readonly encounterId: string;
  readonly encounter: SavedEncounterRequest;
  readonly updatedAt: string;
}

export interface SavedEncounterStore {
  /** The campaign's encounters, newest change first. */
  list(campaignId: string): Promise<readonly SavedEncounterRecord[]>;
  get(campaignId: string, encounterId: string): Promise<SavedEncounterRecord | null>;
  /** Writes it, new or changed; false when a new one would pass the campaign's limit. */
  put(record: SavedEncounterRecord): Promise<boolean>;
  /** False when there is no such encounter. */
  delete(campaignId: string, encounterId: string): Promise<boolean>;
}

export class InMemorySavedEncounterStore implements SavedEncounterStore {
  readonly #records = new Map<string, SavedEncounterRecord>();

  list(campaignId: string): Promise<readonly SavedEncounterRecord[]> {
    return Promise.resolve(
      [...this.#records.values()]
        .filter((record) => record.campaignId === campaignId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((record) => structuredClone(record)),
    );
  }

  get(campaignId: string, encounterId: string): Promise<SavedEncounterRecord | null> {
    const record = this.#records.get(`${campaignId}\n${encounterId}`);
    return Promise.resolve(record ? structuredClone(record) : null);
  }

  put(record: SavedEncounterRecord): Promise<boolean> {
    // Counted and written in one step, as the PostgreSQL store's lock makes it: two at once cannot
    // both take the last place.
    const key = `${record.campaignId}\n${record.encounterId}`;
    const count = [...this.#records.values()].filter(
      (one) => one.campaignId === record.campaignId,
    ).length;
    if (!this.#records.has(key) && count >= MAX_SAVED_ENCOUNTERS) return Promise.resolve(false);
    this.#records.set(key, structuredClone(record));
    return Promise.resolve(true);
  }

  delete(campaignId: string, encounterId: string): Promise<boolean> {
    return Promise.resolve(this.#records.delete(`${campaignId}\n${encounterId}`));
  }
}
