import { MAX_DM_NOTES } from '@ltw/contracts';

/**
 * The DM's notes (docs/adr/0043-dm-screen.md §5; migration 0029): descriptive DM data beside the
 * world, never canonical. The in-memory store is the reference semantics for the PostgreSQL one.
 * A deleted note is kept, marked, and never listed again.
 */
export interface DmNoteRecord {
  readonly campaignId: string;
  readonly noteId: string;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DmNoteStore {
  /** The campaign's notes, newest change first. */
  list(campaignId: string): Promise<readonly DmNoteRecord[]>;
  /** False when the campaign already holds as many notes as it may. */
  create(note: DmNoteRecord): Promise<boolean>;
  /** False when there is no such note. */
  update(
    campaignId: string,
    noteId: string,
    change: Pick<DmNoteRecord, 'title' | 'body' | 'updatedAt'>,
  ): Promise<boolean>;
  delete(campaignId: string, noteId: string, at: string): Promise<boolean>;
}

export class InMemoryDmNoteStore implements DmNoteStore {
  readonly #notes = new Map<string, DmNoteRecord & { readonly deleted: boolean }>();

  list(campaignId: string): Promise<readonly DmNoteRecord[]> {
    return Promise.resolve(
      [...this.#notes.values()]
        .filter((note) => note.campaignId === campaignId && !note.deleted)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(({ campaignId: id, noteId, title, body, createdAt, updatedAt }) => ({
          campaignId: id,
          noteId,
          title,
          body,
          createdAt,
          updatedAt,
        })),
    );
  }

  async create(note: DmNoteRecord): Promise<boolean> {
    if ((await this.list(note.campaignId)).length >= MAX_DM_NOTES) return false;
    this.#notes.set(`${note.campaignId}\n${note.noteId}`, { ...note, deleted: false });
    return true;
  }

  update(
    campaignId: string,
    noteId: string,
    change: Pick<DmNoteRecord, 'title' | 'body' | 'updatedAt'>,
  ): Promise<boolean> {
    const key = `${campaignId}\n${noteId}`;
    const note = this.#notes.get(key);
    if (!note || note.deleted) return Promise.resolve(false);
    this.#notes.set(key, { ...note, ...change });
    return Promise.resolve(true);
  }

  delete(campaignId: string, noteId: string, at: string): Promise<boolean> {
    const key = `${campaignId}\n${noteId}`;
    const note = this.#notes.get(key);
    if (!note || note.deleted) return Promise.resolve(false);
    this.#notes.set(key, { ...note, updatedAt: at, deleted: true });
    return Promise.resolve(true);
  }
}
