import pg from 'pg';

import { describeDatabaseUrl, loadConfig } from '../config/config.ts';
import { createLogger } from '../logging/logger.ts';
import { loadMigrations } from './migration-source.ts';
import { MIGRATIONS_DIR } from './migrations-dir.ts';
import { runMigrations } from './migrator.ts';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ service: 'ltw-migrate', level: config.logLevel });
  const client = new pg.Client({ connectionString: config.databaseUrl });

  logger.info({ database: describeDatabaseUrl(config.databaseUrl) }, 'connecting');
  await client.connect();
  try {
    await runMigrations({ client, migrations: await loadMigrations(MIGRATIONS_DIR), logger });
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
