import {
  MAX_KEPT_HANDOUTS,
  MAX_RANDOM_TABLES,
  type KeptHandout,
  type RandomTable,
} from '@ltw/contracts';

/**
 * The DM's library (docs/adr/0058-campaign-content.md §3–4; migration 0036): handouts kept for
 * later and random tables, the DM's preparation beside the world, never canonical and never a
 * player's to read. The in-memory store is the reference semantics for the PostgreSQL one. A
 * deleted entry is gone; a kept handout given stays, with when it was last given.
 */
export type LibraryRecord =
  | {
      readonly campaignId: string;
      readonly entryId: string;
      readonly kind: 'handout';
      readonly body: KeptHandout;
      readonly updatedAt: string;
      readonly givenAt: string | null;
    }
  | {
      readonly campaignId: string;
      readonly entryId: string;
      readonly kind: 'table';
      readonly body: RandomTable;
      readonly updatedAt: string;
      readonly givenAt: null;
    };
export type LibraryKind = LibraryRecord['kind'];

/** How many of each kind a campaign keeps. */
export const LIBRARY_LIMITS: Readonly<Record<LibraryKind, number>> = {
  handout: MAX_KEPT_HANDOUTS,
  table: MAX_RANDOM_TABLES,
};

/** A write's outcome: done, refused at the campaign's limit, or its ID holds the other kind. */
export type LibraryPut = 'written' | 'limit' | 'kind';

export interface LibraryStore {
  /** The campaign's entries, newest change first. */
  list(campaignId: string): Promise<readonly LibraryRecord[]>;
  get(campaignId: string, entryId: string): Promise<LibraryRecord | null>;
  /** Writes it, new or changed; a change keeps when it was last given. */
  put(record: LibraryRecord): Promise<LibraryPut>;
  /** False when there is no such entry of this kind. */
  delete(campaignId: string, entryId: string, kind: LibraryKind): Promise<boolean>;
  /** Notes a kept handout given now; false when there is no such handout. */
  given(campaignId: string, entryId: string, at: string): Promise<boolean>;
}

export class InMemoryLibraryStore implements LibraryStore {
  readonly #records = new Map<string, LibraryRecord>();

  list(campaignId: string): Promise<readonly LibraryRecord[]> {
    return Promise.resolve(
      [...this.#records.values()]
        .filter((record) => record.campaignId === campaignId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((record) => structuredClone(record)),
    );
  }

  get(campaignId: string, entryId: string): Promise<LibraryRecord | null> {
    const record = this.#records.get(`${campaignId}\n${entryId}`);
    return Promise.resolve(record ? structuredClone(record) : null);
  }

  put(record: LibraryRecord): Promise<LibraryPut> {
    // Counted and written in one step, as the PostgreSQL store's lock makes it.
    const key = `${record.campaignId}\n${record.entryId}`;
    const before = this.#records.get(key);
    if (before && before.kind !== record.kind) return Promise.resolve('kind');
    const count = [...this.#records.values()].filter(
      (one) => one.campaignId === record.campaignId && one.kind === record.kind,
    ).length;
    if (!before && count >= LIBRARY_LIMITS[record.kind]) return Promise.resolve('limit');
    const kept = before?.kind === 'handout' && record.kind === 'handout' ? before.givenAt : null;
    this.#records.set(
      key,
      structuredClone(record.kind === 'handout' ? { ...record, givenAt: kept } : record),
    );
    return Promise.resolve('written');
  }

  delete(campaignId: string, entryId: string, kind: LibraryKind): Promise<boolean> {
    const key = `${campaignId}\n${entryId}`;
    if (this.#records.get(key)?.kind !== kind) return Promise.resolve(false);
    return Promise.resolve(this.#records.delete(key));
  }

  given(campaignId: string, entryId: string, at: string): Promise<boolean> {
    const key = `${campaignId}\n${entryId}`;
    const record = this.#records.get(key);
    if (record?.kind !== 'handout') return Promise.resolve(false);
    this.#records.set(key, { ...record, givenAt: at });
    return Promise.resolve(true);
  }
}
