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
  drop(): Promise<void>;
}

const adminUrl = () => loadConfig({ ...process.env, NODE_ENV: 'test' }).databaseUrl;

async function withAdmin<T>(work: (admin: pg.Client) => Promise<T>): Promise<T> {
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  try {
    return await work(admin);
  } finally {
    await admin.end();
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
  const template = options.copyOf === undefined ? '' : ` TEMPLATE ${options.copyOf.name}`;
  await withAdmin((admin) => admin.query(`CREATE DATABASE ${name}${template}`));
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
      await withAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
    },
  };
}
