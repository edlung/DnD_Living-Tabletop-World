import type pg from 'pg';

import { PackageError } from './package.ts';
import type { StagedTable } from './stage.ts';

/**
 * The staged package written into this server's tables (docs/adr/0061-local-mode.md §5), by each
 * table's kind (`tables.ts`). Two passes: the `state` tables first lose, in reverse order, the rows
 * the package no longer has or has changed; then every table, in order, takes what it lacks. A row
 * the package changed that its kind keeps (`append`), or history that is not the beginning of the
 * package's, refuses the whole import: the two copies were played apart.
 */
export interface TableMerged {
  readonly name: string;
  readonly added: number;
  readonly updated: number;
  readonly deleted: number;
  /** Rows only this server has, which the table's kind keeps. */
  readonly kept: number;
}

/** The two copies were played apart: nothing is written. */
export class DivergedError extends Error {}

const list = (alias: string, columns: readonly string[]) =>
  `(${columns.map((column) => `${alias}.${column}`).join(', ')})`;
const sameKey = (staged: StagedTable) =>
  staged.table.key.map((column) => `t.${column} = s.${column}`).join(' AND ');
const identical = (staged: StagedTable) =>
  `${list('s', staged.columns)} IS NOT DISTINCT FROM ${list('t', staged.columns)}`;
/** The staged row with the same key and the same content (the stage is indexed by its key). */
const matching = (staged: StagedTable) => `${sameKey(staged)} AND ${identical(staged)}`;

async function count(client: pg.ClientBase, sql: string, params: unknown[]): Promise<number> {
  const { rows } = await client.query<{ n: number }>(sql, params);
  return rows[0]?.n ?? 0;
}

export interface StagedHistory {
  readonly streams: StagedTable;
  readonly commands: StagedTable;
  readonly events: StagedTable;
}

/**
 * The history checked: the package's is gapless, and this server's (none for a new campaign) is
 * its beginning, else the copies were played apart. Returns both heads.
 */
export async function checkHistory(
  client: pg.ClientBase,
  campaignId: string,
  history: StagedHistory,
): Promise<{ readonly version: number; readonly hereVersion: number }> {
  const { streams, commands, events } = history;
  const head = await client.query<{ version: string }>(`SELECT version FROM ${streams.stage}`);
  if (head.rows.length !== 1) throw new PackageError('the package has no single history');
  const version = Number(head.rows[0]?.version);
  const shape = await client.query<{ n: string; top: string | null }>(
    `SELECT count(*) AS n, max(sequence) AS top FROM ${events.stage}`,
  );
  if (Number(shape.rows[0]?.n) !== version || Number(shape.rows[0]?.top ?? 0) !== version) {
    throw new PackageError('the history has gaps');
  }
  const here = await client.query<{ version: string }>(
    'SELECT version FROM ltw_event_streams WHERE stream_id = $1 FOR UPDATE',
    [campaignId],
  );
  const hereVersion = here.rows[0] === undefined ? 0 : Number(here.rows[0].version);
  if (hereVersion > version) throw new DivergedError('this server has history the package lacks');
  for (const staged of [commands, events]) {
    const apart = await count(
      client,
      `SELECT count(*)::int AS n FROM ${staged.table.name} t WHERE ${staged.table.where}
         AND NOT EXISTS (SELECT 1 FROM ${staged.stage} s WHERE ${matching(staged)})`,
      [campaignId],
    );
    if (apart > 0)
      throw new DivergedError('the history here is not the beginning of the package’s');
  }
  return { version, hereVersion };
}

/** Appends what `checkHistory` found beyond this server's history; returns the events added. */
export async function appendHistory(
  client: pg.ClientBase,
  campaignId: string,
  history: StagedHistory,
  heads: { readonly version: number; readonly hereVersion: number },
): Promise<number> {
  if (heads.hereVersion === 0) {
    await insertMissing(client, history.streams);
  } else if (heads.version > heads.hereVersion) {
    await client.query('UPDATE ltw_event_streams SET version = $2 WHERE stream_id = $1', [
      campaignId,
      heads.version,
    ]);
  }
  await insertMissing(client, history.commands);
  return insertMissing(client, history.events);
}

/** The first pass, for a `state` table: rows the package lacks or changed go. */
export async function deleteReplaced(
  client: pg.ClientBase,
  campaignId: string,
  staged: StagedTable,
): Promise<number> {
  const { rowCount } = await client.query(
    `DELETE FROM ${staged.table.name} t WHERE ${staged.table.where}
       AND NOT EXISTS (SELECT 1 FROM ${staged.stage} s WHERE ${matching(staged)})`,
    [campaignId],
  );
  return rowCount ?? 0;
}

/** The second pass for every kind but history and accounts. */
export async function mergeRows(
  client: pg.ClientBase,
  campaignId: string,
  staged: StagedTable,
  deleted: number,
): Promise<TableMerged> {
  const { table } = staged;
  let added: number;
  let updated = 0;
  if (table.kind === 'append') {
    const changed = await count(
      client,
      `SELECT count(*)::int AS n FROM ${staged.stage} s JOIN ${table.name} t ON ${sameKey(staged)}
        WHERE NOT (${identical(staged)})`,
      [],
    );
    if (changed > 0) throw new DivergedError(`${table.name}: rows that never change differ here`);
    added = await insertMissing(client, staged);
  } else if (table.kind === 'record') {
    const columns = staged.columns.join(', ');
    const { rows } = await client.query<{ inserted: boolean }>(
      `INSERT INTO ${table.name} AS t (${columns})
       SELECT ${columns} FROM ${staged.stage} ORDER BY ${table.order}
       ON CONFLICT (${table.key.join(', ')}) DO UPDATE
         SET ${staged.columns.map((column) => `${column} = EXCLUDED.${column}`).join(', ')}
         WHERE ${list('t', staged.columns)} IS DISTINCT FROM ${list('EXCLUDED', staged.columns)}
       RETURNING (xmax = 0) AS inserted`,
    );
    added = rows.filter((row) => row.inserted).length;
    updated = rows.length - added;
  } else {
    added = await insertMissing(client, staged);
  }
  const kept =
    table.kind === 'state'
      ? 0
      : await count(
          client,
          `SELECT count(*)::int AS n FROM ${table.name} t WHERE ${table.where}
             AND NOT EXISTS (SELECT 1 FROM ${staged.stage} s WHERE ${sameKey(staged)})`,
          [campaignId],
        );
  return { name: table.name, added, updated, deleted, kept };
}

/** Inserts the staged rows whose key this server lacks, in the table's order. */
async function insertMissing(client: pg.ClientBase, staged: StagedTable): Promise<number> {
  const columns = staged.columns.join(', ');
  const { rowCount } = await client.query(
    `INSERT INTO ${staged.table.name} (${columns})
     SELECT ${columns} FROM ${staged.stage} s
      WHERE NOT EXISTS (SELECT 1 FROM ${staged.table.name} t WHERE ${sameKey(staged)})
      ORDER BY ${staged.table.order}`,
  );
  return rowCount ?? 0;
}
