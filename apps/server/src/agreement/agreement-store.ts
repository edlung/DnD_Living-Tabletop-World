import type { AgreementRequest } from '@ltw/contracts';

/**
 * The table's agreement (docs/adr/0071-memory-and-ritual.md §4; migration 0042): one page a
 * campaign, and for each character the version they said "Understood" to. The in-memory store is
 * the reference semantics for the PostgreSQL one.
 */
export interface AgreementRecord extends AgreementRequest {
  readonly campaignId: string;
  readonly version: number;
  readonly updatedAt: string;
}

export interface UnderstoodRecord {
  readonly campaignId: string;
  readonly characterId: string;
  readonly version: number;
  readonly at: string;
}

export interface AgreementStore {
  read(campaignId: string): Promise<AgreementRecord | null>;
  /** Writes the campaign's page, replacing the one before. */
  write(record: AgreementRecord): Promise<void>;
  /** The latest version each character said "Understood" to. */
  understood(campaignId: string): Promise<readonly UnderstoodRecord[]>;
  /** Keeps the character's "Understood"; an older version never replaces a newer one. */
  markUnderstood(record: UnderstoodRecord): Promise<void>;
}

export class InMemoryAgreementStore implements AgreementStore {
  readonly #pages = new Map<string, AgreementRecord>();
  readonly #understood = new Map<string, UnderstoodRecord>();

  read(campaignId: string): Promise<AgreementRecord | null> {
    return Promise.resolve(this.#pages.get(campaignId) ?? null);
  }

  write(record: AgreementRecord): Promise<void> {
    this.#pages.set(record.campaignId, record);
    return Promise.resolve();
  }

  understood(campaignId: string): Promise<readonly UnderstoodRecord[]> {
    return Promise.resolve(
      [...this.#understood.values()]
        .filter((entry) => entry.campaignId === campaignId)
        .sort((a, b) => a.characterId.localeCompare(b.characterId)),
    );
  }

  markUnderstood(record: UnderstoodRecord): Promise<void> {
    const key = `${record.campaignId}\n${record.characterId}`;
    const known = this.#understood.get(key);
    if (!known || known.version < record.version) this.#understood.set(key, record);
    return Promise.resolve();
  }
}
