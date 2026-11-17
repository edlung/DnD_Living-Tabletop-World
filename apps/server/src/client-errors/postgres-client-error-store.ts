import {
  clientErrorFrameSchema,
  type ClientErrorFrame,
  type ClientErrorReport,
  type ClientErrorRole,
} from '@ltw/contracts';
import type pg from 'pg';
import { z } from 'zod';

import {
  fingerprintOf,
  keptSince,
  listLimit,
  type ClientErrorRecord,
  type ClientErrorStore,
  type NewClientError,
} from './client-error-store.ts';

/** Client error reports on PostgreSQL (migration 0044_client_errors.sql). */
interface ClientErrorRow {
  readonly campaign_id: string;
  readonly fingerprint: string;
  readonly role: string;
  readonly kind: string;
  readonly name: string;
  readonly page: string;
  readonly part: string;
  readonly browser: string;
  readonly browser_version: number;
  readonly system: string;
  readonly shell: string;
  readonly place: unknown;
  readonly build: string;
  readonly seen_count: number;
  readonly first_at: Date;
  readonly last_at: Date;
}

/** A report of no campaign: the column holds the empty string for it. */
const NONE = '';
const frames = z.array(clientErrorFrameSchema);

export class PostgresClientErrorStore implements ClientErrorStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async record(report: NewClientError, at: string): Promise<void> {
    const campaign = report.campaignId ?? NONE;
    await this.#pool.query(
      `INSERT INTO ltw_client_errors
         (campaign_id, fingerprint, role, kind, name, page, part, browser, browser_version,
          system, shell, place, build, seen_count, first_at, last_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, 1, $14, $14)
       ON CONFLICT (campaign_id, fingerprint)
       DO UPDATE SET seen_count = ltw_client_errors.seen_count + 1,
                     build = EXCLUDED.build,
                     last_at = GREATEST(ltw_client_errors.last_at, EXCLUDED.last_at)`,
      [
        campaign,
        fingerprintOf(report),
        report.role,
        report.kind,
        report.name,
        report.page,
        report.part,
        report.browser,
        report.browserVersion,
        report.system,
        report.shell,
        JSON.stringify(report.place),
        report.build,
        at,
      ],
    );
    await this.#pool.query(`DELETE FROM ltw_client_errors WHERE last_at < $1`, [keptSince(at)]);
    // The list keeps its size: past it the longest unseen give way.
    await this.#pool.query(
      `DELETE FROM ltw_client_errors
        WHERE campaign_id = $1 AND fingerprint IN (
          SELECT fingerprint FROM ltw_client_errors WHERE campaign_id = $1
           ORDER BY last_at DESC, fingerprint OFFSET $2)`,
      [campaign, listLimit(report.campaignId)],
    );
  }

  async ofCampaign(campaignId: string): Promise<readonly ClientErrorRecord[]> {
    const { rows } = await this.#pool.query<ClientErrorRow>(
      `SELECT campaign_id, fingerprint, role, kind, name, page, part, browser, browser_version,
              system, shell, place, build, seen_count, first_at, last_at
         FROM ltw_client_errors WHERE campaign_id = $1
        ORDER BY last_at DESC, fingerprint`,
      [campaignId],
    );
    return rows.map((row) => ({
      campaignId: row.campaign_id === NONE ? null : row.campaign_id,
      fingerprint: row.fingerprint,
      role: row.role as ClientErrorRole | 'nobody',
      kind: row.kind as ClientErrorReport['kind'],
      name: row.name as ClientErrorReport['name'],
      page: row.page as ClientErrorReport['page'],
      part: row.part as ClientErrorReport['part'],
      browser: row.browser as ClientErrorReport['browser'],
      browserVersion: row.browser_version,
      system: row.system as ClientErrorReport['system'],
      shell: row.shell as ClientErrorReport['shell'],
      place: frames.parse(row.place) satisfies ClientErrorFrame[],
      build: row.build,
      count: row.seen_count,
      firstAt: row.first_at.toISOString(),
      lastAt: row.last_at.toISOString(),
    }));
  }

  async clear(campaignId: string): Promise<void> {
    await this.#pool.query(`DELETE FROM ltw_client_errors WHERE campaign_id = $1`, [campaignId]);
  }
}
