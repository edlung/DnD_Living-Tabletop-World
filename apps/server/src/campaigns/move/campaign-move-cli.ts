import { chmodSync, createReadStream, createWriteStream, renameSync } from 'node:fs';
import type { Readable, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';

import pg from 'pg';

import { ConfigError, loadConfig } from '../../platform/config/config.ts';
import { ExportRefusal, exportCampaign } from './export.ts';
import { ImportRefusal, importCampaign } from './import.ts';
import { endMove, openMove } from './moves.ts';
import { parseMoveArgs, UsageError, type Command } from './cli-args.ts';
import { DivergedError } from './merge.ts';
import { PackageError } from './package.ts';

/**
 * The operator's campaign move (docs/adr/0061-local-mode.md §5–6; `deploy/scripts/campaign-move.sh`):
 * - `export --campaign <id> [--move --to <where>] [--out <file>]`: the package, gzip, to the file
 *   (written with mode 600, renamed into place when whole) or to standard output; `--move` marks the
 *   campaign away here first;
 * - `import [--in <file>]`: a package from the file or standard input, all of it or nothing;
 * - `status --campaign <id>`: at home, or away (where, since when);
 * - `cancel --campaign <id>`: ends a move whose package never came in elsewhere.
 * Reports are one JSON line on standard error (standard output may carry the package); a refusal
 * exits 1 with its reason, a usage error 2. Nothing prints a row, a hash or a password.
 */
const report = (value: unknown) => {
  process.stderr.write(`${JSON.stringify(value)}\n`);
};

async function run(command: Command, pool: pg.Pool, source: string): Promise<void> {
  if (command.kind === 'status') {
    report({ campaign: command.campaign, away: await openMove(pool, command.campaign) });
    return;
  }
  if (command.kind === 'cancel') {
    const ended = await endMove(pool, command.campaign, 'cancelled', new Date());
    if (!ended) throw new ExportRefusal(`campaign ${command.campaign} is not away`);
    report({ campaign: command.campaign, cancelled: true });
    return;
  }
  if (command.kind === 'import') {
    const input: Readable = command.in === null ? process.stdin : createReadStream(command.in);
    report(await importCampaign(pool, input.pipe(createGunzip())));
    return;
  }
  const gzip = createGzip();
  const partial = command.out === null ? null : `${command.out}.partial`;
  const sink: Writable =
    partial === null ? process.stdout : createWriteStream(partial, { mode: 0o600, flags: 'wx' });
  gzip.pipe(sink);
  const move = command.to === null ? null : { destination: command.to };
  const summary = await exportCampaign(pool, command.campaign, { move, source }, gzip);
  gzip.end();
  // Every compressed byte handed on; standard output is never ended, so only a file is waited for.
  await finished(gzip);
  if (partial !== null && command.out !== null) {
    await finished(sink);
    chmodSync(partial, 0o600);
    renameSync(partial, command.out);
  }
  report(summary);
}

async function main(): Promise<void> {
  let command: Command;
  try {
    command = parseMoveArgs(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`campaign-move: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  let databaseUrl: string;
  let source: string;
  try {
    const config = loadConfig();
    databaseUrl = config.databaseUrl;
    source = (config.auth.mode === 'invitations' ? config.auth.publicOrigin : null) ?? 'a server';
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(`campaign-move: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
  try {
    await run(command, pool, source);
  } catch (error) {
    if (
      error instanceof ExportRefusal ||
      error instanceof ImportRefusal ||
      error instanceof PackageError ||
      error instanceof DivergedError
    ) {
      console.error(`campaign-move: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'error');
  process.exitCode = 1;
});
