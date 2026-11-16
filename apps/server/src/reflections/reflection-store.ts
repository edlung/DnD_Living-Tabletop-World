/**
 * Stars and wishes (docs/adr/0071-memory-and-ritual.md §2; migration 0040): one entry for each
 * author of each session, replaced when written again and removed when emptied. The in-memory
 * store is the reference semantics for the PostgreSQL one.
 */
export interface ReflectionRecord {
  readonly campaignId: string;
  readonly sessionId: string;
  /** The character whose words they are; null for the DM's own. */
  readonly authorId: string | null;
  readonly star: string;
  readonly wish: string;
  /** When it was first written; a later change keeps it. */
  readonly writtenAt: string;
  readonly updatedAt: string;
}

export interface ReflectionStore {
  /** Writes the author's entry for the session, keeping when it was first written. */
  put(record: Omit<ReflectionRecord, 'writtenAt'>): Promise<void>;
  /** Takes the author's entry away; nothing when there is none. */
  remove(campaignId: string, sessionId: string, authorId: string | null): Promise<void>;
  /** A campaign's entries, oldest written first. */
  ofCampaign(campaignId: string): Promise<readonly ReflectionRecord[]>;
}

export class InMemoryReflectionStore implements ReflectionStore {
  readonly #entries = new Map<string, ReflectionRecord>();

  static #key(campaignId: string, sessionId: string, authorId: string | null): string {
    return `${campaignId}\n${sessionId}\n${authorId ?? ''}`;
  }

  put(record: Omit<ReflectionRecord, 'writtenAt'>): Promise<void> {
    const key = InMemoryReflectionStore.#key(record.campaignId, record.sessionId, record.authorId);
    const known = this.#entries.get(key);
    this.#entries.set(key, { ...record, writtenAt: known?.writtenAt ?? record.updatedAt });
    return Promise.resolve();
  }

  remove(campaignId: string, sessionId: string, authorId: string | null): Promise<void> {
    this.#entries.delete(InMemoryReflectionStore.#key(campaignId, sessionId, authorId));
    return Promise.resolve();
  }

  ofCampaign(campaignId: string): Promise<readonly ReflectionRecord[]> {
    return Promise.resolve(
      [...this.#entries.values()]
        .filter((entry) => entry.campaignId === campaignId)
        .sort(
          (a, b) =>
            a.writtenAt.localeCompare(b.writtenAt) ||
            (a.authorId ?? '').localeCompare(b.authorId ?? ''),
        ),
    );
  }
}
