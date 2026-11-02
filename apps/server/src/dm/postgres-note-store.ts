import { MAX_DM_NOTES } from '@ltw/contracts';
import type pg from 'pg';

import type { DmNoteRecord, DmNoteStore } from './note-store.ts';

/**
 * The DM's notes on PostgreSQL (migration 0029_dm_screen.sql). A note is created under a
 * per-campaign advisory lock, so two tabs cannot pass the campaign's limit together.
 */
interface NoteRow {
  readonly campaign_id: string;
  readonly note_id: string;
  readonly title: string;
  readonly body: string;
  readonly created_at: Date;
  readonly updated_at: Date;
}

const toNote = (row: NoteRow): DmNoteRecord => ({
  campaignId: row.campaign_id,
  noteId: row.note_id,
  title: row.title,
  body: row.body,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

export class PostgresDmNoteStore implements DmNoteStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async list(campaignId: string): Promise<readonly DmNoteRecord[]> {
    const { rows } = await this.#pool.query<NoteRow>(
      `SELECT campaign_id, note_id, title, body, created_at, updated_at FROM ltw_dm_notes
        WHERE campaign_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [campaignId],
    );
    return rows.map(toNote);
  }

  async create(note: DmNoteRecord): Promise<boolean> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('ltw_dm_notes:' || $1))`, [
        note.campaignId,
      ]);
      const { rows } = await client.query<{ count: string }>(
        'SELECT count(*) FROM ltw_dm_notes WHERE campaign_id = $1 AND deleted_at IS NULL',
        [note.campaignId],
      );
      if (Number(rows[0]?.count ?? 0) >= MAX_DM_NOTES) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(
        `INSERT INTO ltw_dm_notes (campaign_id, note_id, title, body, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [note.campaignId, note.noteId, note.title, note.body, note.createdAt, note.updatedAt],
      );
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(
    campaignId: string,
    noteId: string,
    change: Pick<DmNoteRecord, 'title' | 'body' | 'updatedAt'>,
  ): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      `UPDATE ltw_dm_notes SET title = $3, body = $4, updated_at = $5
        WHERE campaign_id = $1 AND note_id = $2 AND deleted_at IS NULL`,
      [campaignId, noteId, change.title, change.body, change.updatedAt],
    );
    return (rowCount ?? 0) > 0;
  }

  async delete(campaignId: string, noteId: string, at: string): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      `UPDATE ltw_dm_notes SET deleted_at = $3, updated_at = $3
        WHERE campaign_id = $1 AND note_id = $2 AND deleted_at IS NULL`,
      [campaignId, noteId, at],
    );
    return (rowCount ?? 0) > 0;
  }
}
