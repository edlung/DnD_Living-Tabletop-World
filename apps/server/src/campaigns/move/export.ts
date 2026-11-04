import type { Writable } from 'node:stream';

import type pg from 'pg';

import { endMove, markAway } from './moves.ts';
import { PACKAGE_FORMAT, PACKAGE_VERSION, PackageWriter } from './package.ts';
import { MOVED_TABLES } from './tables.ts';

/**
 * A campaign's package written out (docs/adr/0061-local-mode.md §5–6): a copy, or a move. A move
 * marks the campaign away first, waits for the writes that began before the mark, then reads every
 * table in one snapshot, so nothing written here afterwards is missing from the package: history
 * appends are refused from the mark on (migration 0039), other changes by the HTTP layer. A move
 * that fails before its package is whole is cancelled: the campaign stays at home.
 */
export interface ExportOptions {
  /** A move and where to; null for a copy. */
  readonly move: { readonly destination: string } | null;
  /** The source as its header names it (the server's public origin). */
  readonly source: string;
  readonly now?: () => Date;
  /** How long a move waits for the writes in progress (default 30 s). */
  readonly settleMs?: number;
}

export interface ExportSummary {
  readonly campaignId: string;
  readonly move: boolean;
  readonly tables: readonly { readonly name: string; readonly rows: number }[];
  readonly sha256: string;
}

/** Why a campaign cannot be exported (the message is the operator's). */
export class ExportRefusal extends Error {}

const SETTLE_MS = 30_000;
const SETTLE_POLL_MS = 100;

export async function exportCampaign(
  pool: pg.Pool,
  campaignId: string,
  options: ExportOptions,
  out: Writable,
): Promise<ExportSummary> {
  const now = options.now ?? (() => new Date());
  await refuseUnmovable(pool, campaignId);
  if (options.move !== null) {
    if (!(await markAway(pool, campaignId, options.move.destination, now()))) {
      throw new ExportRefusal(`campaign ${campaignId} is away already`);
    }
  }
  try {
    if (options.move !== null) await settle(pool, options.settleMs ?? SETTLE_MS);
    return await writePackage(pool, campaignId, options, now(), out);
  } catch (error) {
    if (options.move !== null) await endMove(pool, campaignId, 'cancelled', now());
    throw error;
  }
}

async function refuseUnmovable(pool: pg.Pool, campaignId: string): Promise<void> {
  const { rows } = await pool.query<{ history: boolean; published: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM ltw_event_streams WHERE stream_id = $1) AS history,
            EXISTS (SELECT 1 FROM ltw_workshop_campaign_activations WHERE campaign_id = $1) AS published`,
    [campaignId],
  );
  const found = rows[0];
  if (found?.history !== true) throw new ExportRefusal(`no campaign ${campaignId} here`);
  if (found.published) {
    throw new ExportRefusal(
      `campaign ${campaignId} was published from the workshop: such a campaign does not move yet`,
    );
  }
}

/** Waits until every transaction that began before now (the mark's commit) has ended. */
async function settle(pool: pg.Pool, limitMs: number): Promise<void> {
  const { rows } = await pool.query<{ at: Date }>('SELECT clock_timestamp() AS at');
  const markedAt = rows[0]?.at ?? new Date();
  const deadline = Date.now() + limitMs;
  for (;;) {
    const { rows: busy } = await pool.query<{ open: number }>(
      `SELECT count(*)::int AS open FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND backend_type = 'client backend' AND xact_start < $1 AND state <> 'idle'`,
      [markedAt],
    );
    if ((busy[0]?.open ?? 0) === 0) return;
    if (Date.now() > deadline) {
      throw new ExportRefusal('writes in progress did not finish: try the move again');
    }
    await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
  }
}

async function writePackage(
  pool: pg.Pool,
  campaignId: string,
  options: ExportOptions,
  at: Date,
  out: Writable,
): Promise<ExportSummary> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const schema = await client.query<{ id: string }>(
      'SELECT id FROM ltw_schema_migrations ORDER BY id DESC LIMIT 1',
    );
    const writer = new PackageWriter(out);
    await writer.header({
      format: PACKAGE_FORMAT,
      version: PACKAGE_VERSION,
      campaign: campaignId,
      schema: schema.rows[0]?.id ?? 'none',
      source: options.source,
      exportedAt: at.toISOString(),
      move: options.move,
    });
    const tables: { name: string; rows: number }[] = [];
    for (const table of MOVED_TABLES) {
      const columns = await columnsOf(client, table.name);
      await writer.table(table.name, columns);
      let count = 0;
      // The columns by name, so a column this server numbers itself (an identity) stays out.
      const fields = columns.map((column) => `'${column}', t.${column}`).join(', ');
      await client.query(
        `DECLARE move_rows NO SCROLL CURSOR FOR
           SELECT json_build_object(${fields})::text AS line FROM ${table.name} t
            WHERE ${table.where} ORDER BY ${table.order}`,
        [campaignId],
      );
      for (;;) {
        const page = await client.query<{ line: string }>(
          `FETCH ${String(table.batch)} FROM move_rows`,
        );
        for (const row of page.rows) await writer.row(row.line);
        count += page.rows.length;
        if (page.rows.length < table.batch) break;
      }
      await client.query('CLOSE move_rows');
      await writer.end(table.name, count);
      tables.push({ name: table.name, rows: count });
    }
    const sha256 = await writer.finish();
    await client.query('COMMIT');
    return { campaignId, move: options.move !== null, tables, sha256 };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * A table's columns a package carries, in their order: not the ones each server numbers or
 * computes itself (identities such as a table's `position`, generated columns), which the target
 * gives the rows again in the order they arrive.
 */
export async function columnsOf(db: pg.ClientBase, table: string): Promise<string[]> {
  const { rows } = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1
        AND is_identity = 'NO' AND is_generated = 'NEVER'
      ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((row) => row.column_name);
}
