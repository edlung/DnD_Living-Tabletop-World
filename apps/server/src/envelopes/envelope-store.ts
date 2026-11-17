import { MAX_ENVELOPES, type EnvelopeOpens } from '@ltw/contracts';

/**
 * Sealed envelopes (docs/adr/0073-table-ideas.md §9; migration 0047): each holds the handout it
 * becomes and what opens it. Opening happens once: an opened envelope is never sealed again, and
 * a second opening changes nothing. The in-memory store is the reference semantics for the
 * PostgreSQL one.
 */
export interface EnvelopeRecord {
  readonly campaignId: string;
  readonly envelopeId: string;
  /** The outside, for the party to read. */
  readonly label: string;
  /** The inside: the handout it becomes. */
  readonly title: string;
  readonly text: string | null;
  readonly entityId: string | null;
  readonly opens: EnvelopeOpens;
  /** The evening whose chapter opens it; null for the DM's word, or the next evening. */
  readonly sessionId: string | null;
  readonly sealedAt: string;
  readonly openedAt: string | null;
  readonly openedBy: EnvelopeOpens | null;
}

export type NewEnvelope = Omit<EnvelopeRecord, 'openedAt' | 'openedBy'>;

export interface EnvelopeStore {
  /** A campaign's envelopes, the first sealed first. */
  list(campaignId: string): Promise<readonly EnvelopeRecord[]>;
  /**
   * Seals one. `kept` when its ID is sealed already (a retried request), `full` when the campaign
   * holds as many as it may.
   */
  seal(envelope: NewEnvelope): Promise<'sealed' | 'kept' | 'full'>;
  /** Marks a sealed envelope opened; false when there is none sealed by that ID. */
  open(campaignId: string, envelopeId: string, by: EnvelopeOpens, at: string): Promise<boolean>;
  /** Removes one, sealed or opened; false when there is none. */
  delete(campaignId: string, envelopeId: string): Promise<boolean>;
}

export class InMemoryEnvelopeStore implements EnvelopeStore {
  readonly #envelopes = new Map<string, EnvelopeRecord[]>();

  list(campaignId: string): Promise<readonly EnvelopeRecord[]> {
    return Promise.resolve((this.#envelopes.get(campaignId) ?? []).map((one) => ({ ...one })));
  }

  seal(envelope: NewEnvelope): Promise<'sealed' | 'kept' | 'full'> {
    const held = this.#envelopes.get(envelope.campaignId) ?? [];
    if (held.some((one) => one.envelopeId === envelope.envelopeId)) return Promise.resolve('kept');
    if (held.length >= MAX_ENVELOPES) return Promise.resolve('full');
    this.#envelopes.set(envelope.campaignId, [
      ...held,
      { ...envelope, openedAt: null, openedBy: null },
    ]);
    return Promise.resolve('sealed');
  }

  open(campaignId: string, envelopeId: string, by: EnvelopeOpens, at: string): Promise<boolean> {
    const held = this.#envelopes.get(campaignId) ?? [];
    const sealed = held.find((one) => one.envelopeId === envelopeId && one.openedAt === null);
    if (!sealed) return Promise.resolve(false);
    this.#envelopes.set(
      campaignId,
      held.map((one) => (one === sealed ? { ...one, openedAt: at, openedBy: by } : one)),
    );
    return Promise.resolve(true);
  }

  delete(campaignId: string, envelopeId: string): Promise<boolean> {
    const held = this.#envelopes.get(campaignId) ?? [];
    const left = held.filter((one) => one.envelopeId !== envelopeId);
    this.#envelopes.set(campaignId, left);
    return Promise.resolve(left.length !== held.length);
  }
}
