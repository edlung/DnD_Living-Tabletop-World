import pg from 'pg';

import { loadConfig } from '../../platform/config/config.ts';
import { OperatorUsageError, parseOperatorArgs, type OperatorCommand } from './operator-args.ts';
import { runOperatorCommand } from './operator-commands.ts';
import { AccountingRejection } from './types.ts';

/** Entry for `pnpm ai:operator`; commands and their authorization rule are in `operator-commands.ts`. */
async function main(): Promise<void> {
  let command: OperatorCommand;
  try {
    command = parseOperatorArgs(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof OperatorUsageError)) throw error;
    console.error(`ai:operator: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  const pool = new pg.Pool({ connectionString: loadConfig().databaseUrl, max: 2 });
  try {
    console.log(JSON.stringify(await runOperatorCommand(pool, command)));
  } catch (error) {
    if (!(error instanceof AccountingRejection)) throw error;
    console.error(`ai:operator: refused (${error.code})`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : 'error');
  process.exitCode = 1;
});
