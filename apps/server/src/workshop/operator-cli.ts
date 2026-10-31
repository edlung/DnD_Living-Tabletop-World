import pg from 'pg';

import { systemAuthClock } from '../auth/session-authenticator.ts';
import { loadConfig } from '../platform/config/config.ts';
import {
  parseWorkshopOperatorArgs,
  runWorkshopOperatorCommand,
  WorkshopOperatorUsageError,
} from './operator.ts';
import { PostgresWorkshopStore } from './postgres-store.ts';

async function main(): Promise<void> {
  const command = parseWorkshopOperatorArgs(process.argv.slice(2));
  const config = loadConfig();
  if (config.auth.mode !== 'invitations' || !config.auth.publicOrigin)
    throw new Error('INVITATIONS_MODE_REQUIRED');
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 2,
    connectionTimeoutMillis: 5000,
  });
  try {
    const result = await runWorkshopOperatorCommand(
      {
        store: new PostgresWorkshopStore(pool),
        publicOrigin: config.auth.publicOrigin,
        clock: systemAuthClock,
      },
      command,
    );
    // The invitation is printed once only; no credential is ever logged or persisted in clear.
    console.log(JSON.stringify(result));
  } finally {
    await pool.end();
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof WorkshopOperatorUsageError ? error.message : 'workshop:operator: refused',
  );
  process.exitCode = error instanceof WorkshopOperatorUsageError ? 2 : 1;
});
