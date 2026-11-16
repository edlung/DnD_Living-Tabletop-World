import type { KeepsakeKind } from '@ltw/contracts';

/**
 * A campaign's end and its heroes' keepsakes (docs/adr/0072-keepsakes.md §2; migration 0043): one
 * end a campaign, gone when it is reopened; one keepsake a hero, replaced when chosen again. The
 * in-memory store is the reference semantics for the PostgreSQL one.
 */
export interface EndingRecord {
  readonly campaignId: string;
  readonly finishedAt: string;
  readonly line: string;
}

export interface KeepsakeRecord {
  readonly campaignId: string;
  readonly characterId: string;
  readonly kind: KeepsakeKind;
  /** The item or the chapter it names. */
  readonly refId: string;
  /** Its name when it was chosen: the thing may be lost or renamed later, the keepsake stays. */
  readonly label: string;
  readonly line: string;
  readonly keptAt: string;
}

export interface EndingStore {
  read(campaignId: string): Promise<EndingRecord | null>;
  /** Marks the campaign finished, replacing an earlier end. */
  finish(record: EndingRecord): Promise<void>;
  /** Takes the end away: the campaign is played again. Keepsakes stay. */
  reopen(campaignId: string): Promise<void>;
  /** A campaign's keepsakes, by hero. */
  keepsakes(campaignId: string): Promise<readonly KeepsakeRecord[]>;
  /** Keeps the hero's keepsake, replacing the one before. */
  keep(record: KeepsakeRecord): Promise<void>;
  /** Takes the hero's keepsake away; nothing when there is none. */
  drop(campaignId: string, characterId: string): Promise<void>;
}

export class InMemoryEndingStore implements EndingStore {
  readonly #ends = new Map<string, EndingRecord>();
  readonly #kept = new Map<string, KeepsakeRecord>();

  read(campaignId: string): Promise<EndingRecord | null> {
    return Promise.resolve(this.#ends.get(campaignId) ?? null);
  }

  finish(record: EndingRecord): Promise<void> {
    this.#ends.set(record.campaignId, record);
    return Promise.resolve();
  }

  reopen(campaignId: string): Promise<void> {
    this.#ends.delete(campaignId);
    return Promise.resolve();
  }

  keepsakes(campaignId: string): Promise<readonly KeepsakeRecord[]> {
    return Promise.resolve(
      [...this.#kept.values()]
        .filter((entry) => entry.campaignId === campaignId)
        .sort((a, b) => a.characterId.localeCompare(b.characterId)),
    );
  }

  keep(record: KeepsakeRecord): Promise<void> {
    this.#kept.set(`${record.campaignId}\n${record.characterId}`, record);
    return Promise.resolve();
  }

  drop(campaignId: string, characterId: string): Promise<void> {
    this.#kept.delete(`${campaignId}\n${characterId}`);
    return Promise.resolve();
  }
}
