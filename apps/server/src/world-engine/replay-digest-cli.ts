import { readFile } from 'node:fs/promises';
import { text } from 'node:stream/consumers';

import pg from 'pg';

import { loadConfig } from '../platform/config/config.ts';
import {
  compareStreams,
  digestStreams,
  drillVerdict,
  listStreams,
  streamDigestsSchema,
  type StreamDigest,
} from './replay-digest.ts';
import { createRawWorldEngine } from './runtime.ts';

/**
 * The restore drill's CLI (docs/adr/0037-deployment.md §4; `deploy/scripts/restore-drill.sh`),
 * against `DATABASE_URL`. Prints one JSON document; reads nothing but the event store.
 *
 *   digest [--at <campaignId>=<version>]…   replay every stream (or the given ones at the given
 *                                           versions) and print their state digests
 *   compare --expected <file|-> --dumped-at <time> [--allow-empty]
 *                                           replay this database's streams at the expected
 *                                           versions and compare (the drill's verdict): every one
 *                                           must match, the expected set must not be empty unless
 *                                           --allow-empty says the database legitimately is, and
 *                                           every stream here created before <time> (when the dump
 *                                           was taken, UTC `YYYY-MM-DDTHH:MM:SSZ`) must be in it
 *
 * Exit status: 0 when everything replayed consistently (and, for `compare`, the drill passed), 1
 * when not, 2 for a usage error.
 */
type Command =
  | { readonly kind: 'digest'; readonly at: ReadonlyMap<string, number> | undefined }
  | {
      readonly kind: 'compare';
      readonly expected: string;
      readonly dumpedAt: Date;
      readonly allowEmpty: boolean;
    };

const USAGE =
  'usage: replay-digest digest [--at <campaignId>=<version>]... | ' +
  'compare --expected <file|-> --dumped-at <YYYY-MM-DDTHH:MM:SSZ> [--allow-empty]';

function parse(argv: readonly string[]): Command | null {
  const [kind, ...rest] = argv;
  if (kind === 'compare') return parseCompare(rest);
  if (kind !== 'digest') return null;
  if (rest.length === 0) return { kind, at: undefined };
  const at = new Map<string, number>();
  for (let index = 0; index < rest.length; index += 2) {
    const match =
      rest[index] === '--at' ? /^([^=]+)=([1-9]\d{0,14})$/.exec(rest[index + 1] ?? '') : null;
    if (match?.[1] === undefined || match[2] === undefined || at.has(match[1])) return null;
    at.set(match[1], Number(match[2]));
  }
  return { kind, at };
}

function parseCompare(rest: readonly string[]): Command | null {
  let expected: string | undefined;
  let dumpedAt: Date | null | undefined;
  let allowEmpty = false;
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    if (option === '--allow-empty' && !allowEmpty) {
      allowEmpty = true;
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined) return null;
    if (option === '--expected' && expected === undefined) {
      expected = value;
    } else if (option === '--dumped-at' && dumpedAt === undefined) {
      dumpedAt = parseTime(value);
    } else {
      return null;
    }
    index += 1;
  }
  return expected === undefined || dumpedAt === undefined || dumpedAt === null
    ? null
    : { kind: 'compare', expected, dumpedAt, allowEmpty };
}

/** A UTC time `YYYY-MM-DDTHH:MM:SS[.mmm]Z` that exists (no 30 February), or null. */
function parseTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const time = new Date(value);
  return !Number.isNaN(time.getTime()) && time.toISOString().slice(0, 19) === value.slice(0, 19)
    ? time
    : null;
}

async function readExpected(source: string): Promise<StreamDigest[]> {
  const raw = source === '-' ? await text(process.stdin) : await readFile(source, 'utf8');
  return streamDigestsSchema.parse(JSON.parse(raw)).streams;
}

async function main(): Promise<void> {
  const command = parse(process.argv.slice(2));
  if (command === null) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const expected = command.kind === 'compare' ? await readExpected(command.expected) : [];
  const pool = new pg.Pool({ connectionString: loadConfig().databaseUrl, max: 2 });
  try {
    const engine = createRawWorldEngine(pool);
    if (command.kind === 'digest') {
      const streams = await digestStreams(pool, engine, command.at);
      console.log(JSON.stringify({ streams }));
      if (streams.some((stream) => stream.violations > 0)) process.exitCode = 1;
      return;
    }
    const verdict = drillVerdict(await compareStreams(engine, expected), await listStreams(pool), {
      dumpedAt: command.dumpedAt,
      allowEmpty: command.allowEmpty,
    });
    console.log(JSON.stringify(verdict));
    if (verdict.failures.length > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // For the operator running the drill: what failed, never a connection string (none is quoted).
  const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'error';
  console.error(`replay-digest: failed (${reason.slice(0, 300)})`);
  process.exitCode = 1;
});
