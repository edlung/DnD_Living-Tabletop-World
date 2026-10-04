import { readFile } from 'node:fs/promises';

import type pg from 'pg';

/**
 * Test support (excluded from builds): puts a history written by an earlier
 * revision (fixtures/history, Gate 03 retest 2, G03-H05) into a database
 * exactly as that revision's PostgresEventStore stored it, so the current
 * store reads genuine old rows. Rows are inserted, never rewritten.
 */
interface Row {
  readonly [column: string]: unknown;
}

export interface HistoryRows {
  readonly labels: Readonly<Record<string, string>>;
  readonly stream: Row & { readonly stream_id: string; readonly version: number };
  readonly commands: readonly (Row & { readonly command_id: string })[];
  readonly events: readonly (Row & { readonly command_id: string })[];
}

export async function loadHistoryRows(name: string): Promise<HistoryRows> {
  const url = new URL(`../../../../fixtures/history/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8')) as HistoryRows;
}

const COMMAND_COLUMNS = [
  'command_id',
  'stream_id',
  'command_type',
  'actor',
  'fingerprint',
  'command',
  'reason',
  'first_sequence',
  'last_sequence',
  'recorded_at',
];
const EVENT_COLUMNS = [
  'stream_id',
  'sequence',
  'event_id',
  'event_type',
  'schema_version',
  'payload',
  'world_time',
  'recorded_at',
  'command_id',
  'command_type',
  'actor',
];
const JSON_COLUMNS = new Set(['actor', 'command', 'payload']);

async function insert(pool: pg.Pool, table: string, columns: readonly string[], row: Row) {
  const placeholders = columns.map((column, index) =>
    JSON_COLUMNS.has(column) ? `$${String(index + 1)}::jsonb` : `$${String(index + 1)}`,
  );
  await pool.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    columns.map((column) =>
      JSON_COLUMNS.has(column) ? JSON.stringify(row[column]) : (row[column] ?? null),
    ),
  );
}

export async function insertHistory(pool: pg.Pool, history: HistoryRows): Promise<void> {
  await insert(pool, 'ltw_event_streams', ['stream_id', 'version', 'created_at'], history.stream);
  for (const command of history.commands) {
    await insert(pool, 'ltw_commands', COMMAND_COLUMNS, command);
    for (const event of history.events.filter((e) => e.command_id === command.command_id)) {
      await insert(pool, 'ltw_events', EVENT_COLUMNS, event);
    }
  }
}
