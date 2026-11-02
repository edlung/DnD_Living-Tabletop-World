import type pg from 'pg';

import type { Check, RollGroup, RollMode, RollSubject } from '@ltw/contracts';

import type {
  CheckRequestRecord,
  RestRecord,
  RestStore,
  TableRollRecord,
  TableStore,
} from './table-store.ts';

/**
 * PostgreSQL table rolls and check requests (migration 0025_table_rolls.sql; entered and private
 * rolls, private requests and the DM's confirmations, 0031). Rolls are insert-only; a request's
 * answer and its roll are written in one transaction, and only while the request is still open
 * (the row lock makes a second answer wait and then find it answered).
 */
interface RollRow {
  readonly campaign_id: string;
  readonly roll_id: string;
  readonly roller_id: string | null;
  readonly subject: RollSubject;
  readonly groups: readonly RollGroup[];
  readonly hidden: boolean;
  readonly request_id: string | null;
  readonly created_at: Date;
  readonly entered: boolean;
  readonly audience_id: string | null;
  readonly confirmed: boolean;
}

interface RequestRow {
  readonly campaign_id: string;
  readonly request_id: string;
  readonly character_id: string;
  readonly check_spec: Check;
  readonly mode: RollMode;
  readonly dc: number | null;
  readonly status: CheckRequestRecord['status'];
  readonly roll_id: string | null;
  readonly total: number | null;
  readonly created_at: Date;
  readonly group_id: string | null;
  readonly is_private: boolean;
}

const ROLL_COLUMNS =
  'campaign_id, roll_id, roller_id, subject, groups, hidden, request_id, created_at, entered, ' +
  'audience_id';
const INSERT_ROLL = `INSERT INTO ltw_table_rolls (${ROLL_COLUMNS})
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;
/** A roll with whether the DM confirmed it. */
const SELECT_ROLLS = `SELECT ${ROLL_COLUMNS.split(', ')
  .map((column) => `r.${column}`)
  .join(', ')}, (c.roll_id IS NOT NULL) AS confirmed
  FROM ltw_table_rolls r LEFT JOIN ltw_roll_confirmations c
    ON c.campaign_id = r.campaign_id AND c.roll_id = r.roll_id`;
const REQUEST_COLUMNS =
  'campaign_id, request_id, character_id, check_spec, mode, dc, status, roll_id, total, ' +
  'created_at, group_id, is_private';

const toRoll = (row: RollRow): TableRollRecord => ({
  campaignId: row.campaign_id,
  rollId: row.roll_id,
  rollerId: row.roller_id,
  subject: row.subject,
  groups: row.groups,
  hidden: row.hidden,
  entered: row.entered,
  audienceId: row.audience_id,
  confirmed: row.confirmed,
  requestId: row.request_id,
  at: row.created_at.toISOString(),
});

const toRequest = (row: RequestRow): CheckRequestRecord => ({
  campaignId: row.campaign_id,
  requestId: row.request_id,
  characterId: row.character_id,
  check: row.check_spec,
  mode: row.mode,
  dc: row.dc,
  status: row.status,
  rollId: row.roll_id,
  total: row.total,
  at: row.created_at.toISOString(),
  groupId: row.group_id,
  private: row.is_private,
});

const rollValues = (record: TableRollRecord) => [
  record.campaignId,
  record.rollId,
  record.rollerId,
  JSON.stringify(record.subject),
  JSON.stringify(record.groups),
  record.hidden,
  record.requestId,
  record.at,
  record.entered,
  record.audienceId,
];

export class PostgresTableStore implements TableStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async addRoll(record: TableRollRecord): Promise<void> {
    await this.#pool.query(INSERT_ROLL, rollValues(record));
  }

  async recentRolls(campaignId: string, limit: number): Promise<readonly TableRollRecord[]> {
    const { rows } = await this.#pool.query<RollRow>(
      `${SELECT_ROLLS} WHERE r.campaign_id = $1 ORDER BY r.position DESC LIMIT $2`,
      [campaignId, limit],
    );
    return rows.map(toRoll).reverse();
  }

  async findRoll(campaignId: string, rollId: string): Promise<TableRollRecord | null> {
    const { rows } = await this.#pool.query<RollRow>(
      `${SELECT_ROLLS} WHERE r.campaign_id = $1 AND r.roll_id = $2`,
      [campaignId, rollId],
    );
    const row = rows[0];
    return row ? toRoll(row) : null;
  }

  async confirmRoll(campaignId: string, rollId: string, at: string): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_roll_confirmations (campaign_id, roll_id, confirmed_at) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [campaignId, rollId, at],
    );
  }

  async addRequest(record: CheckRequestRecord): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_check_requests (${REQUEST_COLUMNS})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        record.campaignId,
        record.requestId,
        record.characterId,
        JSON.stringify(record.check),
        record.mode,
        record.dc,
        record.status,
        record.rollId,
        record.total,
        record.at,
        record.groupId,
        record.private,
      ],
    );
  }

  async recentRequests(campaignId: string, limit: number): Promise<readonly CheckRequestRecord[]> {
    const { rows } = await this.#pool.query<RequestRow>(
      `SELECT ${REQUEST_COLUMNS} FROM ltw_check_requests WHERE campaign_id = $1
       ORDER BY position DESC LIMIT $2`,
      [campaignId, limit],
    );
    return rows.map(toRequest);
  }

  async findRequest(campaignId: string, requestId: string): Promise<CheckRequestRecord | null> {
    const { rows } = await this.#pool.query<RequestRow>(
      `SELECT ${REQUEST_COLUMNS} FROM ltw_check_requests WHERE campaign_id = $1 AND request_id = $2`,
      [campaignId, requestId],
    );
    const row = rows[0];
    return row ? toRequest(row) : null;
  }

  async answerRequest(roll: TableRollRecord, total: number): Promise<boolean> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(
        `UPDATE ltw_check_requests SET status = 'rolled', roll_id = $3, total = $4
         WHERE campaign_id = $1 AND request_id = $2 AND status = 'open'`,
        [roll.campaignId, roll.requestId, roll.rollId, total],
      );
      if (rowCount !== 1) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(INSERT_ROLL, rollValues(roll));
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelRequest(campaignId: string, requestId: string): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      `UPDATE ltw_check_requests SET status = 'cancelled'
       WHERE campaign_id = $1 AND request_id = $2 AND status = 'open'`,
      [campaignId, requestId],
    );
    return rowCount === 1;
  }
}

/** PostgreSQL short rests (migration 0026): the partial unique index keeps one open per campaign. */
export class PostgresRestStore implements RestStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async openRest(campaignId: string): Promise<RestRecord | null> {
    const { rows } = await this.#pool.query<{
      rest_id: string;
      campaign_id: string;
      started_at: Date;
    }>(
      `SELECT rest_id, campaign_id, started_at FROM ltw_rests
       WHERE campaign_id = $1 AND ended_at IS NULL`,
      [campaignId],
    );
    const row = rows[0];
    return row
      ? {
          restId: row.rest_id,
          campaignId: row.campaign_id,
          kind: 'short',
          startedAt: row.started_at.toISOString(),
          endedAt: null,
        }
      : null;
  }

  async startRest(record: RestRecord): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      `INSERT INTO ltw_rests (campaign_id, rest_id, kind, started_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [record.campaignId, record.restId, record.kind, record.startedAt],
    );
    return rowCount === 1;
  }

  async endRest(campaignId: string, restId: string, at: string): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      `UPDATE ltw_rests SET ended_at = $3
       WHERE campaign_id = $1 AND rest_id = $2 AND ended_at IS NULL`,
      [campaignId, restId, at],
    );
    return rowCount === 1;
  }
}
