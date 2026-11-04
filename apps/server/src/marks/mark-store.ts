import { MAX_MARKS, type MarkKind, type Square } from '@ltw/contracts';

/**
 * The table's shared marks (docs/adr/0057-encounters-maps-loot.md §5; migration 0035): beside the
 * world for the live session, never canonical. Each belongs to the run of the fight it was laid on:
 * a later fight shows none of them, and laying a mark there sweeps them. A ping lasts until it
 * expires; the DM's pointer is one, moved by laying it again; strokes and areas stand until removed
 * or cleared, the oldest giving way past the campaign's limit. The in-memory store is the reference
 * for the PostgreSQL one.
 */
export interface MarkRecord {
  readonly campaignId: string;
  /** The run of the fight it was laid on: its start's event ID (`mark-routes.ts` `fightOf`). */
  readonly fightId: string;
  readonly markId: string;
  readonly authorId: string;
  readonly byDm: boolean;
  readonly kind: MarkKind;
  readonly square?: Square;
  readonly squares?: readonly Square[];
  readonly createdAt: string;
  /** A ping's end; null for marks that stand. */
  readonly expiresAt: string | null;
}

export interface MarkStore {
  /** The fight's marks standing at `now`, oldest first. */
  list(campaignId: string, fightId: string, now: string): Promise<readonly MarkRecord[]>;
  /** Lays a mark, sweeping another fight's: false when its ID is taken (a retried request). */
  add(record: MarkRecord): Promise<boolean>;
  remove(campaignId: string, markId: string): Promise<MarkRecord | null>;
  clear(campaignId: string): Promise<number>;
  playersMayMark(campaignId: string): Promise<boolean>;
  setPlayersMayMark(campaignId: string, allowed: boolean): Promise<void>;
}

export class InMemoryMarkStore implements MarkStore {
  readonly #marks = new Map<string, MarkRecord[]>();
  readonly #allowed = new Map<string, boolean>();

  list(campaignId: string, fightId: string, now: string): Promise<readonly MarkRecord[]> {
    const standing = (this.#marks.get(campaignId) ?? []).filter(
      (mark) => mark.fightId === fightId && (mark.expiresAt === null || mark.expiresAt > now),
    );
    return Promise.resolve(standing.map((mark) => structuredClone(mark)));
  }

  add(record: MarkRecord): Promise<boolean> {
    const marks = this.#marks.get(record.campaignId) ?? [];
    if (marks.some((mark) => mark.markId === record.markId)) return Promise.resolve(false);
    // Another fight's marks go; the pointer is one: laying it again moves it.
    const kept = marks.filter(
      (mark) =>
        mark.fightId === record.fightId && !(record.kind === 'pointer' && mark.kind === 'pointer'),
    );
    kept.push(structuredClone(record));
    // Past the limit the oldest marks give way.
    this.#marks.set(record.campaignId, kept.slice(Math.max(0, kept.length - MAX_MARKS)));
    return Promise.resolve(true);
  }

  remove(campaignId: string, markId: string): Promise<MarkRecord | null> {
    const marks = this.#marks.get(campaignId) ?? [];
    const found = marks.find((mark) => mark.markId === markId) ?? null;
    this.#marks.set(
      campaignId,
      marks.filter((mark) => mark.markId !== markId),
    );
    return Promise.resolve(found);
  }

  clear(campaignId: string): Promise<number> {
    const count = this.#marks.get(campaignId)?.length ?? 0;
    this.#marks.delete(campaignId);
    return Promise.resolve(count);
  }

  playersMayMark(campaignId: string): Promise<boolean> {
    return Promise.resolve(this.#allowed.get(campaignId) ?? false);
  }

  setPlayersMayMark(campaignId: string, allowed: boolean): Promise<void> {
    this.#allowed.set(campaignId, allowed);
    return Promise.resolve();
  }
}
