import pg from 'pg';

import { ConfigError, loadConfig, type AppConfig } from '../platform/config/config.ts';
import { createWorldEngine } from '../world-engine/runtime.ts';
import {
  AuthOperatorRefusal,
  AuthOperatorUsageError,
  parseAuthOperatorArgs,
  runAuthOperatorCommand,
  type AuthOperatorCommand,
} from './operator.ts';
import { PostgresCredentialStore } from './postgres-credential-store.ts';
import { systemAuthClock } from './session-authenticator.ts';
import { PostgresCampaignPublication } from '../campaigns/postgres-publication.ts';
import { PostgresAccountStore } from '../accounts/postgres-account-store.ts';

/**
 * Entry for `pnpm auth:operator` (docs/adr/0036-production-sign-in.md §1, amendment 2026-10-16):
 * - `dm-invite --campaign <id> --expires-hours <n>`: the DM's invitation link, shown this once;
 *   needs `AUTH_MODE=invitations` and `PUBLIC_ORIGIN`, like the server that will redeem it;
 * - `revoke-dm --campaign <id> --authorization-source <reference>`: the DM's sessions and open
 *   DM invitations in that campaign;
 * - `revoke-actor --actor <actorId> --authorization-source <reference>`: sign one actor out
 *   everywhere (its sessions and open invitations in every campaign);
 * - `sessions --campaign <id>`: the campaign's live sessions (no token, no hash);
 * - `reset-password --login <login>`: a single-use reset link for an account (ADR 0041 §7).
 * Prints one JSON line; nothing else ever prints or logs a token.
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
  const publicOrigin =
    config.auth.mode === 'invitations' ? (config.auth.publicOrigin ?? null) : null;
  if (
    (command.kind === 'dm-invite' || command.kind === 'reset-password') &&
    publicOrigin === null
  ) {
    console.error('auth:operator: needs AUTH_MODE=invitations and PUBLIC_ORIGIN');
    process.exitCode = 2;
    return;
  }
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 2 });
  try {
    const result = await runAuthOperatorCommand(
      createWorldEngine(pool),
      {
        credentials: new PostgresCredentialStore(pool),
        publicOrigin,
        clock: systemAuthClock,
        publication: new PostgresCampaignPublication(pool),
        accounts: new PostgresAccountStore(pool),
      },
      command,
    );
    console.log(JSON.stringify(result));
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
