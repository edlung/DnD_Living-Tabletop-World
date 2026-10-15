import pg from 'pg';

import { ConfigError, loadConfig, type AppConfig } from '../platform/config/config.ts';
import { createWorldEngine } from '../world-engine/runtime.ts';
import {
  AuthOperatorRefusal,
  AuthOperatorUsageError,
  issueDmInvitation,
  parseAuthOperatorArgs,
  type AuthOperatorCommand,
} from './operator.ts';
import { PostgresCredentialStore } from './postgres-credential-store.ts';
import { systemAuthClock } from './session-authenticator.ts';

/**
 * Entry for `pnpm auth:operator dm-invite --campaign <id> --expires-hours <n>`
 * (docs/adr/0036-production-sign-in.md §1). Prints one JSON line with the DM's invitation link,
 * shown this once; nothing else ever prints or logs a token. Needs `AUTH_MODE=invitations`
 * and `PUBLIC_ORIGIN`, like the server that will redeem it.
 */
async function main(): Promise<void> {
  let command: AuthOperatorCommand;
  try {
    command = parseAuthOperatorArgs(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof AuthOperatorUsageError)) throw error;
    console.error(`auth:operator: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    // Configuration errors name variables, never their values.
    console.error(`auth:operator: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  const publicOrigin = config.auth.publicOrigin;
  if (config.auth.mode !== 'invitations' || publicOrigin === undefined) {
    console.error('auth:operator: needs AUTH_MODE=invitations and PUBLIC_ORIGIN');
    process.exitCode = 2;
    return;
  }
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 2 });
  try {
    const issued = await issueDmInvitation(
      createWorldEngine(pool),
      { credentials: new PostgresCredentialStore(pool), publicOrigin, clock: systemAuthClock },
      command,
    );
    console.log(JSON.stringify(issued));
  } catch (error) {
    if (!(error instanceof AuthOperatorRefusal)) throw error;
    console.error(`auth:operator: refused (${error.code})`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : 'error');
  process.exitCode = 1;
});
