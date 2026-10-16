import pg from 'pg';

import { imageBudgetStatus, type ImageBudgetStatus } from '../../images/ledger.ts';
import {
  imageChargesFor,
  openImageReservations,
  type ImageChargeRecord,
  type OpenImageReservation,
} from '../../images/ledger-operator.ts';

/**
 * What the smoke reads from the server's database, read-only (`../image-smoke.ts`): the image
 * ledger the operator CLI reports (no DM view shows amounts), the stored picture, and whether an
 * event is in the event store, which proves the database is the server's own.
 */
export interface SmokeStore {
  budget(): Promise<ImageBudgetStatus>;
  charges(campaignId: string, requestId: string): Promise<readonly ImageChargeRecord[]>;
  /** Every unsettled reservation, of any age. */
  openReservations(): Promise<readonly OpenImageReservation[]>;
  campaignRecorded(campaignId: string): Promise<boolean>;
  eventRecorded(campaignId: string, eventId: string): Promise<boolean>;
  storedContent(
    campaignId: string,
    contentHash: string,
  ): Promise<{ readonly mediaType: string; readonly size: number } | null>;
  close(): Promise<void>;
}

export function postgresSmokeStore(databaseUrl: string): SmokeStore {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const exists = async (sql: string, values: readonly unknown[]) =>
    (await pool.query(sql, [...values])).rowCount === 1;
  return {
    budget: () => imageBudgetStatus(pool),
    charges: (campaignId, requestId) => imageChargesFor(pool, campaignId, requestId),
    openReservations: () => openImageReservations(pool, 0),
    campaignRecorded: (campaignId) =>
      exists('SELECT 1 FROM ltw_event_streams WHERE stream_id = $1', [campaignId]),
    eventRecorded: (campaignId, eventId) =>
      exists('SELECT 1 FROM ltw_events WHERE stream_id = $1 AND event_id = $2::uuid', [
        campaignId,
        eventId,
      ]),
    storedContent: async (campaignId, contentHash) => {
      const row = (
        await pool.query<{ media_type: string; size: number }>(
          `SELECT media_type, octet_length(bytes)::int AS size FROM ltw_asset_contents
           WHERE campaign_id = $1 AND content_hash = $2`,
          [campaignId, contentHash],
        )
      ).rows[0];
      return row ? { mediaType: row.media_type, size: row.size } : null;
    },
    close: () => pool.end(),
  };
}
