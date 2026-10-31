import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { loadConfig } from '../platform/config/config.ts';
import { loadMigrations } from '../platform/db/migration-source.ts';
import { MIGRATIONS_DIR } from '../platform/db/migrations-dir.ts';
import { runMigrations } from '../platform/db/migrator.ts';
import { createLogger } from '../platform/logging/logger.ts';

/**
 * Integration-test support (excluded from builds): a fresh PostgreSQL
 * database per test, created on the server from DATABASE_URL and dropped
 * afterwards. Fails, rather than skips, when PostgreSQL is unreachable.
 */
export interface ThrowawayDatabase {
  readonly name: string;
  readonly url: string;
  /** Waits (bounded) for client connections to close, then drops the database by force. */
  drop(): Promise<void>;
}

const adminUrl = () => loadConfig({ ...process.env, NODE_ENV: 'test' }).databaseUrl;

/**
 * How long a drop or a template copy waits for the test's own connections to finish closing.
 * `pool.end()` resolves before its clients' sockets close (pg-pool ends them without waiting), so
 * a forced drop right after it could terminate an idle client mid-close; its pool then emits the
 * `57P01` error with no listener, an uncaught exception that fails the whole run. Past the wait
 * the drop still forces, so a test that leaks a connection leaves no database behind.
 */
const CLOSE_WAIT_MS = 5_000;

async function withAdmin<T>(work: (admin: pg.Client) => Promise<T>): Promise<T> {
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  try {
    return await work(admin);
  } finally {
    await admin.end();
  }
}

async function clientConnections(admin: pg.Client, database: string): Promise<number> {
  const result = await admin.query<{ open: number }>(
    `SELECT count(*)::int AS open FROM pg_stat_activity
     WHERE datname = $1 AND backend_type = 'client backend'`,
    [database],
  );
  return result.rows[0]?.open ?? 0;
}

async function untilDisconnected(admin: pg.Client, database: string): Promise<void> {
  const deadline = Date.now() + CLOSE_WAIT_MS;
  while ((await clientConnections(admin, database)) > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export async function createThrowawayDatabase(
  options: {
    readonly migrate?: boolean;
    /**
     * A throwaway database to copy (`CREATE DATABASE … TEMPLATE`), as a restore would; nothing
     * may be connected to it meanwhile.
     */
    readonly copyOf?: ThrowawayDatabase;
  } = {},
): Promise<ThrowawayDatabase> {
  const name = `ltw_it_${randomUUID().replaceAll('-', '')}`;
  const { copyOf } = options;
  await withAdmin(async (admin) => {
    if (copyOf !== undefined) await untilDisconnected(admin, copyOf.name);
    const template = copyOf === undefined ? '' : ` TEMPLATE ${copyOf.name}`;
    await admin.query(`CREATE DATABASE ${name}${template}`);
  });
  const url = new URL(adminUrl());
  url.pathname = `/${name}`;

  if (options.migrate === true) {
    const client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    try {
      await runMigrations({
        client,
        migrations: await loadMigrations(MIGRATIONS_DIR),
        logger: createLogger({ service: 'throwaway-db', level: 'silent' }),
      });
    } finally {
      await client.end();
    }
  }

  return {
    name,
    url: url.toString(),
    drop: async () => {
      await withAdmin(async (admin) => {
        await untilDisconnected(admin, name);
        await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      });
    },
  };
}
