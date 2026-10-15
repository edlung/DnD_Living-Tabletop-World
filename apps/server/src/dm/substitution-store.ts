import type { SubstitutionReason } from '@ltw/contracts';

/**
 * The DM's reasons for acting for a player's character (docs/adr/0033-live-session.md §6;
 * docs/STAGE_310_DESIGN.md §B; migration 0009). DM data, descriptive, never canonical: the
 * stored command with the DM as issuer is the record of what happened, and a reason whose
 * command was never stored describes nothing. Append-only, one per command ID and campaign.
 */
export interface SubstitutionRecord {
  readonly campaignId: string;
  /** The command's stored ID: `http:<dmActorId>:<clientCommandId>`. */
  readonly commandId: string;
  readonly characterId: string;
  readonly reason: SubstitutionReason;
  readonly note: string | null;
  readonly createdAt: string;
}

export type RecordOutcome = 'recorded' | 'duplicate' | 'conflict';

export interface SubstitutionStore {
  /**
   * Appends the record. When one is already stored under its command ID, answers `duplicate`
   * if it says the same (character, reason and note) and `conflict` otherwise, changing nothing.
   */
  record(record: SubstitutionRecord): Promise<RecordOutcome>;
  find(campaignId: string, commandId: string): Promise<SubstitutionRecord | null>;
  /** The records of those command IDs in that campaign, by command ID. */
  forCommands(
    campaignId: string,
    commandIds: readonly string[],
  ): Promise<ReadonlyMap<string, SubstitutionRecord>>;
}

/** Whether a stored record says what a new one would. */
export const sameSubstitution = (a: SubstitutionRecord, b: SubstitutionRecord): boolean =>
  a.characterId === b.characterId && a.reason === b.reason && a.note === b.note;

export class InMemorySubstitutionStore implements SubstitutionStore {
  readonly #records = new Map<string, SubstitutionRecord>();

  record(record: SubstitutionRecord): Promise<RecordOutcome> {
    const key = keyOf(record.campaignId, record.commandId);
    const stored = this.#records.get(key);
    if (stored) return Promise.resolve(sameSubstitution(stored, record) ? 'duplicate' : 'conflict');
    this.#records.set(key, { ...record });
    return Promise.resolve('recorded');
  }

  find(campaignId: string, commandId: string): Promise<SubstitutionRecord | null> {
    const stored = this.#records.get(keyOf(campaignId, commandId));
    return Promise.resolve(stored ? { ...stored } : null);
  }

  forCommands(
    campaignId: string,
    commandIds: readonly string[],
  ): Promise<ReadonlyMap<string, SubstitutionRecord>> {
    const found = new Map<string, SubstitutionRecord>();
    for (const commandId of commandIds) {
      const stored = this.#records.get(keyOf(campaignId, commandId));
      if (stored) found.set(commandId, { ...stored });
    }
    return Promise.resolve(found);
  }
}

const keyOf = (campaignId: string, commandId: string) => `${campaignId}\u0000${commandId}`;
