import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createThrowawayDatabase,
  type ThrowawayDatabase,
} from '../../testing/throwaway-database.ts';
import { LEFT_BEHIND, MOVED_TABLES } from './tables.ts';

/**
 * The move's tables held to the schema every migration builds (docs/adr/0061-local-mode.md §5):
 * each table that names a campaign either moves or stays with its reason, so a later table is a
 * decision and never a silent loss; each moved table's key is its primary key; a table whose rows
 * never change is merged as such, and one whose rows the merge replaces lets them go.
 */
let database: ThrowawayDatabase;
let pool: pg.Pool;

beforeAll(async () => {
  database = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: database.url });
});

afterAll(async () => {
  await pool.end();
  await database.drop();
});

async function tablesNamingACampaign(): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT DISTINCT table_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_name IN ('campaign_id', 'stream_id')
        AND table_name IN (SELECT table_name FROM information_schema.tables
                            WHERE table_schema = current_schema() AND table_type = 'BASE TABLE')
      ORDER BY table_name`,
  );
  return rows.map((row) => row.table_name);
}

async function primaryKey(table: string): Promise<string[]> {
  const { rows } = await pool.query<{ column: string }>(
    `SELECT a.attname AS column FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      WHERE i.indrelid = $1::regclass AND i.indisprimary`,
    [table],
  );
  return rows.map((row) => row.column).sort();
}

async function triggers(table: string): Promise<string[]> {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT tgname AS name FROM pg_trigger WHERE tgrelid = $1::regclass AND NOT tgisinternal`,
    [table],
  );
  return rows.map((row) => row.name);
}

describe('the tables a move carries', () => {
  it('cover every table that names a campaign, or leave it behind with a reason', async () => {
    const moved = new Set(MOVED_TABLES.map((table) => table.name));
    const decided = (await tablesNamingACampaign()).filter(
      (table) => !moved.has(table) && LEFT_BEHIND[table] === undefined,
    );
    expect(decided).toEqual([]);
    const existing = new Set(await tablesNamingACampaign());
    for (const name of [...moved, ...Object.keys(LEFT_BEHIND)]) {
      // Accounts and the table link's seats name no campaign themselves; they move through one.
      if (name !== 'ltw_accounts' && name !== 'ltw_table_link_seats') {
        expect(existing.has(name), name).toBe(true);
      }
    }
  });

  it('key each table by its primary key and merge it as its triggers allow', async () => {
    for (const table of MOVED_TABLES) {
      expect(await primaryKey(table.name), table.name).toEqual([...table.key].sort());
      const names = await triggers(table.name);
      const neverChanges = names.some((name) => name.endsWith('_append_only'));
      if (table.kind === 'append') expect(neverChanges, table.name).toBe(true);
      if (table.kind === 'state') {
        const keeps = names.some((name) =>
          /_(append_only|one_way|immutable|no_delete)$/.test(name),
        );
        expect(keeps, table.name).toBe(false);
      }
    }
  });
});
