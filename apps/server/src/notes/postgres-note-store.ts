import { MAX_PLAYER_NOTES } from '@ltw/contracts';
import type pg from 'pg';

import type { BackstoryRecord, NoteOwner, NoteStore, PlayerNoteRecord } from './note-store.ts';

/** Backstories and private notes on PostgreSQL (migration 0045_backstories_and_notes.sql). */
interface BackstoryRow {
  readonly campaign_id: string;
  readonly character_id: string;
  readonly body: string;
  readonly written_by: 'player' | 'dm';
  readonly updated_at: Date;
}

interface NoteRow {
  readonly campaign_id: string;
  readonly owner_id: string;
  readonly character_id: string;
  readonly note_id: string;
  readonly title: string;
  readonly body: string;
  readonly created_at: Date;
  readonly updated_at: Date;
}

const noteOf = (row: NoteRow): PlayerNoteRecord => ({
  campaignId: row.campaign_id,
  ownerId: row.owner_id,
  characterId: row.character_id,
  noteId: row.note_id,
  title: row.title,
  body: row.body,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const NOTE_COLUMNS =
  'campaign_id, owner_id, character_id, note_id, title, body, created_at, updated_at';

export class PostgresNoteStore implements NoteStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async backstory(campaignId: string, characterId: string): Promise<BackstoryRecord | null> {
    const { rows } = await this.#pool.query<BackstoryRow>(
      `SELECT campaign_id, character_id, body, written_by, updated_at
         FROM ltw_backstories WHERE campaign_id = $1 AND character_id = $2`,
      [campaignId, characterId],
    );
    const row = rows[0];
    return row
      ? {
          campaignId: row.campaign_id,
          characterId: row.character_id,
          body: row.body,
          writtenBy: row.written_by,
          updatedAt: row.updated_at.toISOString(),
        }
      : null;
  }

  async writeBackstory(record: BackstoryRecord): Promise<void> {
    if (record.body === '') {
      await this.#pool.query(
        `DELETE FROM ltw_backstories WHERE campaign_id = $1 AND character_id = $2`,
        [record.campaignId, record.characterId],
      );
      return;
    }
    await this.#pool.query(
      `INSERT INTO ltw_backstories (campaign_id, character_id, body, written_by, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (campaign_id, character_id)
       DO UPDATE SET body = EXCLUDED.body, written_by = EXCLUDED.written_by,
                     updated_at = EXCLUDED.updated_at`,
      [record.campaignId, record.characterId, record.body, record.writtenBy, record.updatedAt],
    );
  }

  async notes(owner: NoteOwner): Promise<readonly PlayerNoteRecord[]> {
    const { rows } = await this.#pool.query<NoteRow>(
      `SELECT ${NOTE_COLUMNS} FROM ltw_player_notes
        WHERE campaign_id = $1 AND owner_id = $2 AND character_id = $3
        ORDER BY updated_at DESC, note_id`,
      [owner.campaignId, owner.ownerId, owner.characterId],
    );
    return rows.map(noteOf);
  }

  async writeNote(note: Omit<PlayerNoteRecord, 'createdAt'>): Promise<boolean> {
    // One statement: a changed note keeps its first time and its character; a new one is taken
    // only while the owner has room for it.
    const { rowCount } = await this.#pool.query(
      `INSERT INTO ltw_player_notes
         (campaign_id, owner_id, character_id, note_id, title, body, created_at, updated_at)
       SELECT $1, $2, $3, $4, $5, $6, $7, $7
        WHERE EXISTS (SELECT 1 FROM ltw_player_notes
                       WHERE campaign_id = $1 AND owner_id = $2 AND note_id = $4)
           OR (SELECT count(*) FROM ltw_player_notes
                WHERE campaign_id = $1 AND owner_id = $2 AND character_id = $3) < $8
       ON CONFLICT (campaign_id, owner_id, note_id)
       DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body,
                     updated_at = EXCLUDED.updated_at
        WHERE ltw_player_notes.character_id = EXCLUDED.character_id`,
      [
        note.campaignId,
        note.ownerId,
        note.characterId,
        note.noteId,
        note.title,
        note.body,
        note.updatedAt,
        MAX_PLAYER_NOTES,
      ],
    );
    return (rowCount ?? 0) > 0;
  }

  async deleteNote(owner: NoteOwner, noteId: string): Promise<void> {
    await this.#pool.query(
      `DELETE FROM ltw_player_notes
        WHERE campaign_id = $1 AND owner_id = $2 AND character_id = $3 AND note_id = $4`,
      [owner.campaignId, owner.ownerId, owner.characterId, noteId],
    );
  }

  async notesOfOwner(campaignId: string, ownerId: string): Promise<readonly PlayerNoteRecord[]> {
    const { rows } = await this.#pool.query<NoteRow>(
      `SELECT ${NOTE_COLUMNS} FROM ltw_player_notes
        WHERE campaign_id = $1 AND owner_id = $2
        ORDER BY updated_at DESC, note_id`,
      [campaignId, ownerId],
    );
    return rows.map(noteOf);
  }

  async forgetOwner(campaignId: string, ownerId: string): Promise<void> {
    await this.#pool.query(
      `DELETE FROM ltw_player_notes WHERE campaign_id = $1 AND owner_id = $2`,
      [campaignId, ownerId],
    );
  }
}
