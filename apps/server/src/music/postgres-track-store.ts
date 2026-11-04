import { MAX_TRACKS, MUSIC_MEDIA_TYPES, type MusicMediaType } from '@ltw/contracts';
import type pg from 'pg';

import type { TrackAdd, TrackRecord, TrackStore } from './track-store.ts';

/**
 * The DM's music on PostgreSQL (migration 0038_music_tracks.sql). A track is added under a
 * per-campaign advisory lock, so two tabs cannot pass the campaign's thirty together; its bytes are
 * kept uncompressed, so a range is read with `substring` without the whole value.
 */
interface TrackRow {
  readonly campaign_id: string;
  readonly track_id: string;
  readonly request_id: string;
  readonly title: string;
  readonly media_type: string;
  readonly size: number;
  readonly added_at: Date;
}

const COLUMNS =
  'campaign_id, track_id, request_id, title, media_type, octet_length(bytes) AS size, added_at';

const isMediaType = (value: string): value is MusicMediaType =>
  (MUSIC_MEDIA_TYPES as readonly string[]).includes(value);

function toRecord(row: TrackRow): TrackRecord {
  if (!isMediaType(row.media_type)) throw new Error('A stored track has an unknown media type.');
  return {
    campaignId: row.campaign_id,
    trackId: row.track_id,
    requestId: row.request_id,
    title: row.title,
    mediaType: row.media_type,
    bytes: row.size,
    addedAt: row.added_at.toISOString(),
  };
}

export class PostgresTrackStore implements TrackStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async list(campaignId: string): Promise<readonly TrackRecord[]> {
    const { rows } = await this.#pool.query<TrackRow>(
      `SELECT ${COLUMNS} FROM ltw_music_tracks WHERE campaign_id = $1 ORDER BY added_at, track_id`,
      [campaignId],
    );
    return rows.map(toRecord);
  }

  async get(campaignId: string, trackId: string): Promise<TrackRecord | null> {
    const { rows } = await this.#pool.query<TrackRow>(
      `SELECT ${COLUMNS} FROM ltw_music_tracks WHERE campaign_id = $1 AND track_id = $2`,
      [campaignId, trackId],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async read(
    campaignId: string,
    trackId: string,
    start: number,
    length: number,
  ): Promise<Uint8Array | null> {
    // SQL counts bytes from one.
    const { rows } = await this.#pool.query<{ part: Buffer }>(
      `SELECT substring(bytes FROM $3 FOR $4) AS part
         FROM ltw_music_tracks WHERE campaign_id = $1 AND track_id = $2`,
      [campaignId, trackId, start + 1, length],
    );
    const row = rows[0];
    return row ? new Uint8Array(row.part) : null;
  }

  async add(track: TrackAdd): Promise<TrackRecord | 'limit'> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('ltw_music_tracks:' || $1))`, [
        track.campaignId,
      ]);
      const before = await client.query<TrackRow>(
        `SELECT ${COLUMNS} FROM ltw_music_tracks WHERE campaign_id = $1 AND request_id = $2`,
        [track.campaignId, track.requestId],
      );
      const again = before.rows[0];
      if (again) {
        await client.query('ROLLBACK');
        return toRecord(again);
      }
      const { rows } = await client.query<{ count: string }>(
        'SELECT count(*) AS count FROM ltw_music_tracks WHERE campaign_id = $1',
        [track.campaignId],
      );
      if (Number(rows[0]?.count ?? 0) >= MAX_TRACKS) {
        await client.query('ROLLBACK');
        return 'limit';
      }
      const added = await client.query<TrackRow>(
        `INSERT INTO ltw_music_tracks
           (campaign_id, track_id, request_id, title, media_type, bytes, added_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${COLUMNS}`,
        [
          track.campaignId,
          track.trackId,
          track.requestId,
          track.title,
          track.mediaType,
          Buffer.from(track.content),
          track.addedAt,
        ],
      );
      await client.query('COMMIT');
      const row = added.rows[0];
      if (!row) throw new Error('A track was not added.');
      return toRecord(row);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(campaignId: string, trackId: string): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      'DELETE FROM ltw_music_tracks WHERE campaign_id = $1 AND track_id = $2',
      [campaignId, trackId],
    );
    return (rowCount ?? 0) > 0;
  }
}
