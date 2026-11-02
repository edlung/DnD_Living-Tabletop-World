/**
 * Displays, casts and table links (docs/adr/0042-table-display.md, migration 0028). Tokens and
 * codes by their SHA-256 hashes only; the in-memory store is the reference semantics for the
 * PostgreSQL one. A display's identity never changes, it pairs once, and a revocation is final.
 */
export interface DisplayRecord {
  readonly displayId: string;
  readonly tokenHash: string;
  /** The pairing code's hash while the device waits for the DM; null once paired. */
  readonly codeHash: string | null;
  readonly codeExpiresAt: string;
  readonly campaignId: string | null;
  readonly name: string | null;
  readonly pairedBy: string | null;
  readonly createdAt: string;
  readonly pairedAt: string | null;
  readonly expiresAt: string;
  readonly lastSeenAt: string | null;
  readonly revokedAt: string | null;
}

export type NewDisplay = Pick<
  DisplayRecord,
  'displayId' | 'tokenHash' | 'codeHash' | 'codeExpiresAt' | 'createdAt' | 'expiresAt'
>;

export interface StoredCast {
  /** The cast as its contract schema validated it. */
  readonly cast: unknown;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface TableLinkRecord {
  readonly linkId: string;
  readonly campaignId: string;
  readonly tokenHash: string;
  readonly codeHash: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly closedAt: string | null;
}

export interface TableSeatRecord {
  readonly linkId: string;
  readonly invitationId: string;
  readonly characterId: string;
  readonly seatedAt: string;
}

export interface DisplayStore {
  createDisplay(display: NewDisplay): Promise<void>;
  findDisplay(tokenHash: string): Promise<DisplayRecord | null>;
  /**
   * Pairs the display whose live code this is (not expired, not paired, not revoked) with the
   * campaign; null when there is none. At most `limit` live displays per campaign.
   */
  pairDisplay(
    codeHash: string,
    campaignId: string,
    name: string,
    pairedBy: string,
    now: string,
    limit: number,
  ): Promise<DisplayRecord | null | 'full'>;
  /** The campaign's paired displays that are not revoked and not expired. */
  campaignDisplays(campaignId: string, now: string): Promise<DisplayRecord[]>;
  renameDisplay(campaignId: string, displayId: string, name: string): Promise<boolean>;
  /** Revokes one display of the campaign, or every one; how many. */
  revokeDisplays(campaignId: string, displayId: string | null, now: string): Promise<number>;
  /** Notes the device was seen (coarse: at most once a minute). */
  displaySeen(displayId: string, now: string): Promise<void>;
  /** Deletes the displays that never paired and whose code expired before the cutoff; how many. */
  pruneWaiting(codeExpiredBefore: string): Promise<number>;

  readCast(campaignId: string): Promise<StoredCast | null>;
  /** Replaces the campaign's cast; its new revision. */
  writeCast(campaignId: string, cast: unknown, now: string): Promise<number>;

  createTableLink(link: Omit<TableLinkRecord, 'closedAt'>): Promise<void>;
  findTableLink(
    by: { readonly tokenHash: string } | { readonly codeHash: string },
  ): Promise<TableLinkRecord | null>;
  /** Closes every open link of the campaign; how many. */
  closeTableLinks(campaignId: string, now: string): Promise<number>;
  /** The campaign's newest link that is neither closed nor expired. */
  openTableLink(campaignId: string, now: string): Promise<TableLinkRecord | null>;
  addTableSeat(seat: TableSeatRecord): Promise<void>;
  tableSeats(linkId: string): Promise<TableSeatRecord[]>;
}

const MINUTE_MS = 60_000;
const live = (display: DisplayRecord, now: string) =>
  display.revokedAt === null && display.expiresAt > now;

export class InMemoryDisplayStore implements DisplayStore {
  readonly #displays = new Map<string, DisplayRecord>();
  readonly #casts = new Map<string, StoredCast>();
  readonly #links = new Map<string, TableLinkRecord>();
  readonly #seats: TableSeatRecord[] = [];

  createDisplay(display: NewDisplay): Promise<void> {
    this.#displays.set(display.displayId, {
      ...display,
      campaignId: null,
      name: null,
      pairedBy: null,
      pairedAt: null,
      lastSeenAt: null,
      revokedAt: null,
    });
    return Promise.resolve();
  }

  findDisplay(tokenHash: string): Promise<DisplayRecord | null> {
    return Promise.resolve(
      [...this.#displays.values()].find((display) => display.tokenHash === tokenHash) ?? null,
    );
  }

  pairDisplay(
    codeHash: string,
    campaignId: string,
    name: string,
    pairedBy: string,
    now: string,
    limit: number,
  ): Promise<DisplayRecord | null | 'full'> {
    const display = [...this.#displays.values()].find(
      (candidate) =>
        candidate.codeHash === codeHash &&
        candidate.campaignId === null &&
        candidate.codeExpiresAt > now &&
        live(candidate, now),
    );
    if (!display) return Promise.resolve(null);
    const paired = [...this.#displays.values()].filter(
      (candidate) => candidate.campaignId === campaignId && live(candidate, now),
    );
    if (paired.length >= limit) return Promise.resolve('full');
    const next: DisplayRecord = {
      ...display,
      codeHash: null,
      campaignId,
      name,
      pairedBy,
      pairedAt: now,
    };
    this.#displays.set(display.displayId, next);
    return Promise.resolve(next);
  }

  campaignDisplays(campaignId: string, now: string): Promise<DisplayRecord[]> {
    return Promise.resolve(
      [...this.#displays.values()]
        .filter((display) => display.campaignId === campaignId && live(display, now))
        .sort((a, b) => (a.pairedAt ?? '').localeCompare(b.pairedAt ?? '')),
    );
  }

  renameDisplay(campaignId: string, displayId: string, name: string): Promise<boolean> {
    const display = this.#displays.get(displayId);
    if (display?.campaignId !== campaignId || display.revokedAt !== null) {
      return Promise.resolve(false);
    }
    this.#displays.set(displayId, { ...display, name });
    return Promise.resolve(true);
  }

  revokeDisplays(campaignId: string, displayId: string | null, now: string): Promise<number> {
    let count = 0;
    for (const display of this.#displays.values()) {
      if (display.campaignId !== campaignId || display.revokedAt !== null) continue;
      if (displayId !== null && display.displayId !== displayId) continue;
      this.#displays.set(display.displayId, { ...display, revokedAt: now });
      count += 1;
    }
    return Promise.resolve(count);
  }

  displaySeen(displayId: string, now: string): Promise<void> {
    const display = this.#displays.get(displayId);
    const last = display?.lastSeenAt ?? null;
    if (display && (last === null || Date.parse(now) - Date.parse(last) >= MINUTE_MS)) {
      this.#displays.set(displayId, { ...display, lastSeenAt: now });
    }
    return Promise.resolve();
  }

  pruneWaiting(codeExpiredBefore: string): Promise<number> {
    let count = 0;
    for (const display of [...this.#displays.values()]) {
      if (display.campaignId !== null || display.codeExpiresAt >= codeExpiredBefore) continue;
      this.#displays.delete(display.displayId);
      count += 1;
    }
    return Promise.resolve(count);
  }

  readCast(campaignId: string): Promise<StoredCast | null> {
    return Promise.resolve(this.#casts.get(campaignId) ?? null);
  }

  writeCast(campaignId: string, cast: unknown, now: string): Promise<number> {
    const revision = (this.#casts.get(campaignId)?.revision ?? 0) + 1;
    this.#casts.set(campaignId, { cast: structuredClone(cast), revision, updatedAt: now });
    return Promise.resolve(revision);
  }

  createTableLink(link: Omit<TableLinkRecord, 'closedAt'>): Promise<void> {
    this.#links.set(link.linkId, { ...link, closedAt: null });
    return Promise.resolve();
  }

  findTableLink(
    by: { readonly tokenHash: string } | { readonly codeHash: string },
  ): Promise<TableLinkRecord | null> {
    return Promise.resolve(
      [...this.#links.values()].find((link) =>
        'tokenHash' in by ? link.tokenHash === by.tokenHash : link.codeHash === by.codeHash,
      ) ?? null,
    );
  }

  closeTableLinks(campaignId: string, now: string): Promise<number> {
    let count = 0;
    for (const link of this.#links.values()) {
      if (link.campaignId !== campaignId || link.closedAt !== null) continue;
      this.#links.set(link.linkId, { ...link, closedAt: now });
      count += 1;
    }
    return Promise.resolve(count);
  }

  openTableLink(campaignId: string, now: string): Promise<TableLinkRecord | null> {
    const open = [...this.#links.values()]
      .filter(
        (link) => link.campaignId === campaignId && link.closedAt === null && link.expiresAt > now,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return Promise.resolve(open[0] ?? null);
  }

  addTableSeat(seat: TableSeatRecord): Promise<void> {
    this.#seats.push(seat);
    return Promise.resolve();
  }

  tableSeats(linkId: string): Promise<TableSeatRecord[]> {
    return Promise.resolve(this.#seats.filter((seat) => seat.linkId === linkId));
  }
}
