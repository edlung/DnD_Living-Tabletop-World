import type pg from 'pg';

import type {
  DisplayRecord,
  DisplayStore,
  NewDisplay,
  StoredCast,
  TableLinkRecord,
  TableSeatRecord,
} from './display-store.ts';

/**
 * Displays, casts and table links on PostgreSQL (migration 0028_table_display.sql). A pairing is
 * one conditional update under a per-campaign advisory lock, so two DMs typing codes at once
 * cannot pass the campaign's limit; a cast's revision grows in the same statement that writes it.
 */
interface DisplayRow {
  readonly display_id: string;
  readonly token_hash: string;
  readonly code_hash: string | null;
  readonly code_expires_at: Date;
  readonly campaign_id: string | null;
  readonly name: string | null;
  readonly paired_by: string | null;
  readonly created_at: Date;
  readonly paired_at: Date | null;
  readonly expires_at: Date;
  readonly last_seen_at: Date | null;
  readonly revoked_at: Date | null;
}

interface LinkRow {
  readonly link_id: string;
  readonly campaign_id: string;
  readonly token_hash: string;
  readonly code_hash: string;
  readonly created_by: string;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly closed_at: Date | null;
}

const DISPLAY_COLUMNS =
  'display_id, token_hash, code_hash, code_expires_at, campaign_id, name, paired_by, created_at, ' +
  'paired_at, expires_at, last_seen_at, revoked_at';
const LINK_COLUMNS =
  'link_id, campaign_id, token_hash, code_hash, created_by, created_at, expires_at, closed_at';

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

const toDisplay = (row: DisplayRow): DisplayRecord => ({
  displayId: row.display_id,
  tokenHash: row.token_hash,
  codeHash: row.code_hash,
  codeExpiresAt: row.code_expires_at.toISOString(),
  campaignId: row.campaign_id,
  name: row.name,
  pairedBy: row.paired_by,
  createdAt: row.created_at.toISOString(),
  pairedAt: iso(row.paired_at),
  expiresAt: row.expires_at.toISOString(),
  lastSeenAt: iso(row.last_seen_at),
  revokedAt: iso(row.revoked_at),
});

const toLink = (row: LinkRow): TableLinkRecord => ({
  linkId: row.link_id,
  campaignId: row.campaign_id,
  tokenHash: row.token_hash,
  codeHash: row.code_hash,
  createdBy: row.created_by,
  createdAt: row.created_at.toISOString(),
  expiresAt: row.expires_at.toISOString(),
  closedAt: iso(row.closed_at),
});

export class PostgresDisplayStore implements DisplayStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async createDisplay(display: NewDisplay): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_displays (display_id, token_hash, code_hash, code_expires_at, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        display.displayId,
        display.tokenHash,
        display.codeHash,
        display.codeExpiresAt,
        display.createdAt,
        display.expiresAt,
      ],
    );
  }

  async findDisplay(tokenHash: string): Promise<DisplayRecord | null> {
    const { rows } = await this.#pool.query<DisplayRow>(
      `SELECT ${DISPLAY_COLUMNS} FROM ltw_displays WHERE token_hash = $1`,
      [tokenHash],
    );
    return rows[0] ? toDisplay(rows[0]) : null;
  }

  async pairDisplay(
    codeHash: string,
    campaignId: string,
    name: string,
    pairedBy: string,
    now: string,
    limit: number,
  ): Promise<DisplayRecord | null | 'full'> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('ltw_displays:' || $1))`, [
        campaignId,
      ]);
      const { rows: counted } = await client.query<{ count: string }>(
        `SELECT count(*) FROM ltw_displays
          WHERE campaign_id = $1 AND revoked_at IS NULL AND expires_at > $2`,
        [campaignId, now],
      );
      if (Number(counted[0]?.count ?? 0) >= limit) {
        await client.query('ROLLBACK');
        return 'full';
      }
      const { rows } = await client.query<DisplayRow>(
        `UPDATE ltw_displays
            SET code_hash = NULL, campaign_id = $2, name = $3, paired_by = $4, paired_at = $5
          WHERE code_hash = $1 AND campaign_id IS NULL AND code_expires_at > $5
            AND revoked_at IS NULL AND expires_at > $5
          RETURNING ${DISPLAY_COLUMNS}`,
        [codeHash, campaignId, name, pairedBy, now],
      );
      await client.query('COMMIT');
      return rows[0] ? toDisplay(rows[0]) : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async campaignDisplays(campaignId: string, now: string): Promise<DisplayRecord[]> {
    const { rows } = await this.#pool.query<DisplayRow>(
      `SELECT ${DISPLAY_COLUMNS} FROM ltw_displays
        WHERE campaign_id = $1 AND revoked_at IS NULL AND expires_at > $2
        ORDER BY paired_at`,
      [campaignId, now],
    );
    return rows.map(toDisplay);
  }

  async renameDisplay(campaignId: string, displayId: string, name: string): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      `UPDATE ltw_displays SET name = $3
        WHERE campaign_id = $1 AND display_id = $2 AND revoked_at IS NULL`,
      [campaignId, displayId, name],
    );
    return (rowCount ?? 0) > 0;
  }

  async revokeDisplays(campaignId: string, displayId: string | null, now: string): Promise<number> {
    const { rowCount } = await this.#pool.query(
      `UPDATE ltw_displays SET revoked_at = $3
        WHERE campaign_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR display_id = $2)`,
      [campaignId, displayId, now],
    );
    return rowCount ?? 0;
  }

  async displaySeen(displayId: string, now: string): Promise<void> {
    await this.#pool.query(
      `UPDATE ltw_displays SET last_seen_at = $2
        WHERE display_id = $1 AND (last_seen_at IS NULL OR last_seen_at <= $2::timestamptz - interval '1 minute')`,
      [displayId, now],
    );
  }

  async pruneWaiting(codeExpiredBefore: string): Promise<number> {
    const { rowCount } = await this.#pool.query(
      'DELETE FROM ltw_displays WHERE campaign_id IS NULL AND code_expires_at < $1',
      [codeExpiredBefore],
    );
    return rowCount ?? 0;
  }

  async readCast(campaignId: string): Promise<StoredCast | null> {
    const { rows } = await this.#pool.query<{
      cast_view: unknown;
      revision: number;
      updated_at: Date;
    }>(`SELECT cast_view, revision, updated_at FROM ltw_display_casts WHERE campaign_id = $1`, [
      campaignId,
    ]);
    const row = rows[0];
    return row
      ? { cast: row.cast_view, revision: row.revision, updatedAt: row.updated_at.toISOString() }
      : null;
  }

  async writeCast(campaignId: string, cast: unknown, now: string): Promise<number> {
    const { rows } = await this.#pool.query<{ revision: number }>(
      `INSERT INTO ltw_display_casts (campaign_id, cast_view, revision, updated_at)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (campaign_id) DO UPDATE
         SET cast_view = EXCLUDED.cast_view, revision = ltw_display_casts.revision + 1,
             updated_at = EXCLUDED.updated_at
       RETURNING revision`,
      [campaignId, JSON.stringify(cast), now],
    );
    return rows[0]?.revision ?? 1;
  }

  async createTableLink(link: Omit<TableLinkRecord, 'closedAt'>): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_table_links (link_id, campaign_id, token_hash, code_hash, created_by, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        link.linkId,
        link.campaignId,
        link.tokenHash,
        link.codeHash,
        link.createdBy,
        link.createdAt,
        link.expiresAt,
      ],
    );
  }

  async findTableLink(
    by: { readonly tokenHash: string } | { readonly codeHash: string },
  ): Promise<TableLinkRecord | null> {
    const [column, value] =
      'tokenHash' in by ? ['token_hash', by.tokenHash] : ['code_hash', by.codeHash];
    const { rows } = await this.#pool.query<LinkRow>(
      `SELECT ${LINK_COLUMNS} FROM ltw_table_links WHERE ${column} = $1`,
      [value],
    );
    return rows[0] ? toLink(rows[0]) : null;
  }

  async closeTableLinks(campaignId: string, now: string): Promise<number> {
    const { rowCount } = await this.#pool.query(
      `UPDATE ltw_table_links SET closed_at = $2 WHERE campaign_id = $1 AND closed_at IS NULL`,
      [campaignId, now],
    );
    return rowCount ?? 0;
  }

  async openTableLink(campaignId: string, now: string): Promise<TableLinkRecord | null> {
    const { rows } = await this.#pool.query<LinkRow>(
      `SELECT ${LINK_COLUMNS} FROM ltw_table_links
        WHERE campaign_id = $1 AND closed_at IS NULL AND expires_at > $2
        ORDER BY created_at DESC LIMIT 1`,
      [campaignId, now],
    );
    return rows[0] ? toLink(rows[0]) : null;
  }

  async addTableSeat(seat: TableSeatRecord): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_table_link_seats (link_id, invitation_id, character_id, seated_at)
       VALUES ($1, $2, $3, $4)`,
      [seat.linkId, seat.invitationId, seat.characterId, seat.seatedAt],
    );
  }

  async tableSeats(linkId: string): Promise<TableSeatRecord[]> {
    const { rows } = await this.#pool.query<{
      link_id: string;
      invitation_id: string;
      character_id: string;
      seated_at: Date;
    }>(
      `SELECT link_id, invitation_id, character_id, seated_at FROM ltw_table_link_seats
        WHERE link_id = $1 ORDER BY seated_at`,
      [linkId],
    );
    return rows.map((row) => ({
      linkId: row.link_id,
      invitationId: row.invitation_id,
      characterId: row.character_id,
      seatedAt: row.seated_at.toISOString(),
    }));
  }
}
