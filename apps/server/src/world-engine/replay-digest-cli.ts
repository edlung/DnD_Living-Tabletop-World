import { readFile } from 'node:fs/promises';
import { text } from 'node:stream/consumers';

import pg from 'pg';

import { loadConfig } from '../platform/config/config.ts';
import {
  compareStreams,
  digestStreams,
  streamDigestsSchema,
  type StreamDigest,
} from './replay-digest.ts';
import { createWorldEngine } from './runtime.ts';

/**
 * The restore drill's CLI (docs/adr/0037-deployment.md §4; `deploy/scripts/restore-drill.sh`),
 * against `DATABASE_URL`. Prints one JSON document; reads nothing but the event store.
 *
 *   digest [--at <campaignId>=<version>]…   replay every stream (or the given ones at the given
 *                                           versions) and print their state digests
 *   compare --expected <file|->             replay this database's streams at the expected
 *                                           versions and compare; exit 1 on any difference
 *
 * Exit status: 0 when everything replayed consistently (and, for `compare`, matched), 1 when not,
 * 2 for a usage error.
 */
type Command =
  | { readonly kind: 'digest'; readonly at: ReadonlyMap<string, number> | undefined }
  | { readonly kind: 'compare'; readonly expected: string };

const USAGE =
  'usage: replay-digest digest [--at <campaignId>=<version>]... | compare --expected <file|->';

function parse(argv: readonly string[]): Command | null {
  const [kind, ...rest] = argv;
  if (kind === 'compare') {
    return rest.length === 2 && rest[0] === '--expected' && rest[1] !== undefined
      ? { kind, expected: rest[1] }
      : null;
  }
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
    const engine = createWorldEngine(pool);
    if (command.kind === 'digest') {
      const streams = await digestStreams(pool, engine, command.at);
      console.log(JSON.stringify({ streams }));
      if (streams.some((stream) => stream.violations > 0)) process.exitCode = 1;
      return;
    }
    const streams = await compareStreams(engine, expected);
    const matched = streams.filter((stream) => stream.status === 'match').length;
    console.log(JSON.stringify({ compared: streams.length, matched, streams }));
    if (matched !== streams.length) process.exitCode = 1;
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
