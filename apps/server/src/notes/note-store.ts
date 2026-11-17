import { MAX_PLAYER_NOTES } from '@ltw/contracts';

/**
 * A hero's backstory and a player's private notes (docs/adr/0073-table-ideas.md §5; migration
 * 0045). A backstory is one text a character; a note belongs to the person who wrote it — their
 * actor in the campaign — as one character, and every read and write names that owner: there is
 * no way to ask for another's. The in-memory store is the reference semantics for the PostgreSQL
 * one.
 */
export interface BackstoryRecord {
  readonly campaignId: string;
  readonly characterId: string;
  readonly body: string;
  readonly writtenBy: 'player' | 'dm';
  readonly updatedAt: string;
}

export interface PlayerNoteRecord {
  readonly campaignId: string;
  /** The actor who wrote it. */
  readonly ownerId: string;
  readonly characterId: string;
  readonly noteId: string;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Whose notes: one person, as one character, in one campaign. */
export interface NoteOwner {
  readonly campaignId: string;
  readonly ownerId: string;
  readonly characterId: string;
}

export interface NoteStore {
  backstory(campaignId: string, characterId: string): Promise<BackstoryRecord | null>;
  /** Writes the backstory; an empty body takes it away. */
  writeBackstory(record: BackstoryRecord): Promise<void>;
  /** The owner's notes as that character, the latest changed first. */
  notes(owner: NoteOwner): Promise<readonly PlayerNoteRecord[]>;
  /**
   * Writes the owner's note, keeping when it was first written. False when it would be one more
   * than the owner may keep, or the ID is a note of the owner's as another character.
   */
  writeNote(note: Omit<PlayerNoteRecord, 'createdAt'>): Promise<boolean>;
  /** Deletes the owner's note for good; nothing when there is none. */
  deleteNote(owner: NoteOwner, noteId: string): Promise<void>;
  /** Everything a person wrote in a campaign, as any character: for their copy of their data. */
  notesOfOwner(campaignId: string, ownerId: string): Promise<readonly PlayerNoteRecord[]>;
  /** Deletes everything a person wrote in a campaign: their account is deleted. */
  forgetOwner(campaignId: string, ownerId: string): Promise<void>;
}

const latestFirst = (a: PlayerNoteRecord, b: PlayerNoteRecord) =>
  b.updatedAt.localeCompare(a.updatedAt) || a.noteId.localeCompare(b.noteId);

export class InMemoryNoteStore implements NoteStore {
  readonly #backstories = new Map<string, BackstoryRecord>();
  readonly #notes = new Map<string, PlayerNoteRecord>();

  static #note(campaignId: string, ownerId: string, noteId: string): string {
    return `${campaignId}\n${ownerId}\n${noteId}`;
  }

  backstory(campaignId: string, characterId: string): Promise<BackstoryRecord | null> {
    return Promise.resolve(this.#backstories.get(`${campaignId}\n${characterId}`) ?? null);
  }

  writeBackstory(record: BackstoryRecord): Promise<void> {
    const key = `${record.campaignId}\n${record.characterId}`;
    if (record.body === '') this.#backstories.delete(key);
    else this.#backstories.set(key, { ...record });
    return Promise.resolve();
  }

  notes(owner: NoteOwner): Promise<readonly PlayerNoteRecord[]> {
    return Promise.resolve(
      [...this.#notes.values()]
        .filter(
          (note) =>
            note.campaignId === owner.campaignId &&
            note.ownerId === owner.ownerId &&
            note.characterId === owner.characterId,
        )
        .sort(latestFirst),
    );
  }

  async writeNote(note: Omit<PlayerNoteRecord, 'createdAt'>): Promise<boolean> {
    const key = InMemoryNoteStore.#note(note.campaignId, note.ownerId, note.noteId);
    const known = this.#notes.get(key);
    if (known && known.characterId !== note.characterId) return false;
    if (!known && (await this.notes(note)).length >= MAX_PLAYER_NOTES) return false;
    this.#notes.set(key, { ...note, createdAt: known?.createdAt ?? note.updatedAt });
    return true;
  }

  deleteNote(owner: NoteOwner, noteId: string): Promise<void> {
    const key = InMemoryNoteStore.#note(owner.campaignId, owner.ownerId, noteId);
    if (this.#notes.get(key)?.characterId === owner.characterId) this.#notes.delete(key);
    return Promise.resolve();
  }

  notesOfOwner(campaignId: string, ownerId: string): Promise<readonly PlayerNoteRecord[]> {
    return Promise.resolve(
      [...this.#notes.values()]
        .filter((note) => note.campaignId === campaignId && note.ownerId === ownerId)
        .sort(latestFirst),
    );
  }

  forgetOwner(campaignId: string, ownerId: string): Promise<void> {
    for (const [key, note] of this.#notes) {
      if (note.campaignId === campaignId && note.ownerId === ownerId) this.#notes.delete(key);
    }
    return Promise.resolve();
  }
}
