import type pg from 'pg';

import { columnsOf } from './export.ts';
import { PackageError, type PackageLine } from './package.ts';
import { MOVED_TABLES, type MovedTable } from './tables.ts';

/**
 * A package's rows staged in the import's transaction (docs/adr/0061-local-mode.md §6): one
 * temporary table per moved table, shaped like it, dropped at the commit. PostgreSQL parses each
 * row (`json_populate_recordset`), so types, checks and lengths are its own; the import compares
 * and merges from here. A table or a column this server does not have refuses the package, and so
 * does a table out of the moved order (a newer source's package needs a newer build).
 */
export interface StagedTable {
  readonly table: MovedTable;
  /** The temporary table holding the package's rows. */
  readonly stage: string;
  /** The package's columns, all of them the table's. */
  readonly columns: readonly string[];
  readonly rows: number;
}

/** Rows or bytes a staging statement takes at most. */
const BATCH_ROWS = 500;
const BATCH_BYTES = 16 * 1024 * 1024;

export class Stager {
  readonly #client: pg.ClientBase;
  readonly #staged: StagedTable[] = [];
  #next = 0;
  #open: {
    table: MovedTable;
    stage: string;
    columns: readonly string[];
    rows: number;
    batch: string[];
    bytes: number;
  } | null = null;

  constructor(client: pg.ClientBase) {
    this.#client = client;
  }

  get staged(): readonly StagedTable[] {
    return this.#staged;
  }

  async take(line: PackageLine): Promise<void> {
    if (line.kind === 'table') await this.#begin(line.name, line.columns);
    else if (line.kind === 'row') await this.#row(line.json, line.bytes);
    else await this.#end(line.name, line.rows);
  }

  async #begin(name: string, columns: readonly string[]): Promise<void> {
    const index = MOVED_TABLES.findIndex((table) => table.name === name);
    if (index < this.#next) throw new PackageError(`table ${name} is not one a move carries here`);
    const table = MOVED_TABLES[index];
    if (table === undefined) throw new PackageError(`table ${name} is not one a move carries here`);
    this.#next = index + 1;
    const known = new Set(await columnsOf(this.#client, name));
    const unknown = columns.filter((column) => !known.has(column));
    if (unknown.length > 0 || new Set(columns).size !== columns.length) {
      throw new PackageError(
        `table ${name} has columns this server does not: a newer build wrote it`,
      );
    }
    for (const column of [...table.key, table.owner.column]) {
      if (!columns.includes(column)) throw new PackageError(`table ${name} lacks ${column}`);
    }
    const stage = `move_stage_${String(index)}`;
    await this.#client.query(
      `CREATE TEMPORARY TABLE ${stage} (LIKE ${name} INCLUDING DEFAULTS INCLUDING IDENTITY INCLUDING GENERATED) ON COMMIT DROP`,
    );
    this.#open = { table, stage, columns, rows: 0, batch: [], bytes: 0 };
  }

  async #row(json: string, bytes: number): Promise<void> {
    const open = this.#open;
    if (open === null) throw new PackageError('a row out of place');
    open.batch.push(json);
    open.bytes += bytes;
    open.rows += 1;
    if (open.batch.length >= BATCH_ROWS || open.bytes >= BATCH_BYTES) await this.#flush();
  }

  async #flush(): Promise<void> {
    const open = this.#open;
    if (open === null || open.batch.length === 0) return;
    const list = open.columns.join(', ');
    await this.#client.query(
      `INSERT INTO ${open.stage} (${list})
       SELECT ${list} FROM json_populate_recordset(NULL::${open.stage}, $1::json)`,
      [`[${open.batch.join(',')}]`],
    );
    open.batch = [];
    open.bytes = 0;
  }

  async #end(name: string, rows: number): Promise<void> {
    const open = this.#open;
    if (open?.table.name !== name) throw new PackageError(`table ${name} ends unopened`);
    if (open.rows !== rows)
      throw new PackageError(`table ${name} has ${String(open.rows)} rows, not ${String(rows)}`);
    await this.#flush();
    // The merge looks rows up by their key; a temporary table is never analyzed on its own.
    await this.#client.query(`CREATE INDEX ON ${open.stage} (${open.table.key.join(', ')})`);
    await this.#client.query(`ANALYZE ${open.stage}`);
    this.#staged.push({ table: open.table, stage: open.stage, columns: open.columns, rows });
    this.#open = null;
  }

  /**
   * Every staged row is the campaign's: its owner column names it, or (`via`) appears in the
   * staged rows of the table it belongs through. Throws naming the first table that fails.
   */
  async assertOwnedBy(campaignId: string): Promise<void> {
    for (const staged of this.#staged) {
      const { column, via } = staged.table.owner;
      let foreign: string;
      if (via === undefined) {
        foreign = `SELECT count(*)::int AS n FROM ${staged.stage} WHERE ${column} IS DISTINCT FROM $1`;
      } else {
        const through = this.#staged.find((other) => other.table.name === via);
        if (through === undefined)
          throw new PackageError(`table ${staged.table.name} comes without ${via}`);
        foreign = `SELECT count(*)::int AS n FROM ${staged.stage} s
          WHERE NOT EXISTS (SELECT 1 FROM ${through.stage} o WHERE o.${column} = s.${column})`;
      }
      const { rows } = await this.#client.query<{ n: number }>(
        foreign,
        via === undefined ? [campaignId] : [],
      );
      if ((rows[0]?.n ?? 0) > 0) {
        throw new PackageError(`table ${staged.table.name} holds rows of another campaign`);
      }
    }
  }
}
