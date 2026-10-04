import { ASSET_MEDIA_TYPES, type AssetMediaType } from '@ltw/contracts';
import type pg from 'pg';

import {
  checkContent,
  contentHashOf,
  type AssetContentStore,
  type StoredContent,
} from './content-store.ts';

/**
 * PostgreSQL asset contents (migration 0004_asset_contents.sql). Insert-only:
 * the table rejects updates and deletes, and the same bytes stored again are
 * left as they are. Content is found only within its own campaign.
 */
export class PostgresAssetContentStore implements AssetContentStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async put(campaignId: string, content: StoredContent): Promise<string> {
    checkContent(content);
    const contentHash = contentHashOf(content.bytes);
    await this.#pool.query(
      `INSERT INTO ltw_asset_contents (campaign_id, content_hash, media_type, bytes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (campaign_id, content_hash) DO NOTHING`,
      [campaignId, contentHash, content.mediaType, Buffer.from(content.bytes)],
    );
    return contentHash;
  }

  async get(campaignId: string, contentHash: string): Promise<StoredContent | null> {
    const result = await this.#pool.query<{ media_type: string; bytes: Buffer }>(
      `SELECT media_type, bytes FROM ltw_asset_contents
       WHERE campaign_id = $1 AND content_hash = $2`,
      [campaignId, contentHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (!(ASSET_MEDIA_TYPES as readonly string[]).includes(row.media_type)) {
      throw new Error('stored asset content has an unknown media type');
    }
    return { bytes: new Uint8Array(row.bytes), mediaType: row.media_type as AssetMediaType };
  }

  /** Campaigns with asset requests, for the worker's loop. */
  static async campaignsWithAssetWork(pool: pg.Pool): Promise<string[]> {
    const result = await pool.query<{ stream_id: string }>(
      `SELECT DISTINCT stream_id FROM ltw_events WHERE event_type = 'AssetRequested'`,
    );
    return result.rows.map((row) => row.stream_id);
  }
}
