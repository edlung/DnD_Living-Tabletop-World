import pg from 'pg';

import { describeDatabaseUrl, loadConfig } from '../config/config.ts';
import { createLogger } from '../logging/logger.ts';
import { loadMigrations } from './migration-source.ts';
import { MIGRATIONS_DIR } from './migrations-dir.ts';
import { runMigrations } from './migrator.ts';

/**
 * `pnpm db:migrate [--allow-newer-database]`. The option is the deployment's rollback step
 * (docs/adr/0037-deployment.md, part A): an earlier image starts on a database a newer image
 * migrated, applying nothing; without it such a database is refused.
 */
const ALLOW_NEWER = '--allow-newer-database';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== ALLOW_NEWER)) {
    console.error(`db:migrate: the only option is ${ALLOW_NEWER}`);
    process.exitCode = 2;
    return;
  }
  const config = loadConfig();
  const logger = createLogger({ service: 'ltw-migrate', level: config.logLevel });
  const client = new pg.Client({ connectionString: config.databaseUrl });

  logger.info({ database: describeDatabaseUrl(config.databaseUrl) }, 'connecting');
  await client.connect();
  try {
    await runMigrations({
      client,
      migrations: await loadMigrations(MIGRATIONS_DIR),
      logger,
      allowNewerDatabase: args.includes(ALLOW_NEWER),
    });
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
