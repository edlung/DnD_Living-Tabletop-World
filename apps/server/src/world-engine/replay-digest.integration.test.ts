import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { loadRavenfordSeed } from './ravenford-seed.ts';
import { streamDigestsSchema } from './replay-digest.ts';
import { createWorldEngine } from './runtime.ts';

/**
 * The restore drill's CLI against PostgreSQL (docs/adr/0037-deployment.md §4;
 * `deploy/scripts/restore-drill.sh`): a copy of the database (as a restore makes) replays to the
 * digests the live database has at the same version, even after the live one went on; any
 * difference, a missing stream, an empty restore (unless the operator allows it), a live stream
 * created before the dump but missing from it, or a malformed request fails with a non-zero
 * exit status.
 */
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const CLI = fileURLToPath(new URL('./replay-digest-cli.ts', import.meta.url));
const ZERO_DIGEST = `sha256:${'0'.repeat(64)}`;
/** Long before any test database existed: no live stream was created before it. */
const LONG_AGO = '2000-01-01T00:00:00Z';
/** A dump's time as restore-drill.sh passes it: whole seconds, UTC. */
const dumpTime = (time = new Date()) => `${time.toISOString().slice(0, 19)}Z`;
const inOneMinute = () => dumpTime(new Date(Date.now() + 60_000));

interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function cli(url: string, args: readonly string[], stdin = ''): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      ['--conditions=@ltw/source', CLI, ...args],
      { cwd: ROOT, env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: url } },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : -1;
        resolve({ code, stdout, stderr });
      },
    );
    child.stdin?.end(stdin);
  });
}

let live: ThrowawayDatabase;
let pool: pg.Pool;
/** The seeded stream's version: what a backup taken now holds. */
let seeded: number;
const copies: ThrowawayDatabase[] = [];

beforeEach(async () => {
  live = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: live.url, max: 4 });
  // The campaign, its places and people: enough history to replay, quick to write.
  const engine = createWorldEngine(pool);
  for (const submission of (await loadRavenfordSeed()).submissions.slice(0, 60)) {
    expect((await engine.execute(submission)).status).toBe('accepted');
  }
  seeded = (await engine.load('ravenford'))?.state.version ?? 0;
  expect(seeded).toBeGreaterThan(1);
});

afterEach(async () => {
  await pool.end();
  for (const copy of copies.splice(0)) await copy.drop();
  await live.drop();
});

/** A copy of the live Ravenford stream as another campaign, created now (as a new campaign is). */
async function copyLiveStream(streamId: string): Promise<void> {
  await pool.query(
    `INSERT INTO ltw_event_streams (stream_id, version)
       SELECT $1, version FROM ltw_event_streams WHERE stream_id = 'ravenford'`,
    [streamId],
  );
  await pool.query(
    `INSERT INTO ltw_commands (command_id, stream_id, command_type, actor, fingerprint, command,
       reason, first_sequence, last_sequence, recorded_at)
     SELECT $1 || '.' || command_id, $1, command_type, actor, fingerprint, command, reason,
       first_sequence, last_sequence, recorded_at FROM ltw_commands WHERE stream_id = 'ravenford'`,
    [streamId],
  );
  await pool.query(
    `INSERT INTO ltw_events (stream_id, sequence, event_id, event_type, schema_version, payload,
       world_time, recorded_at, command_id, command_type, actor)
     SELECT $1, sequence, gen_random_uuid(), event_type, schema_version, payload, world_time,
       recorded_at, $1 || '.' || command_id, command_type, actor
       FROM ltw_events WHERE stream_id = 'ravenford'`,
    [streamId],
  );
}

async function advanceLive(): Promise<void> {
  const result = await createWorldEngine(pool).execute({
    commandId: 'after-the-backup',
    campaignId: 'ravenford',
    actor: { actorId: 'dm-ravenford', kind: 'user' },
    command: { type: 'AdvanceWorldTime', by: 60 },
  });
  expect(result.status).toBe('accepted');
}

describe('replay-digest CLI', () => {
  it('replays a restored copy to the digests the live database has at the same version', async () => {
    await pool.end(); // a template copy needs the original idle
    const restored = await createThrowawayDatabase({ copyOf: live });
    copies.push(restored);
    const dumpedAt = inOneMinute();
    pool = new pg.Pool({ connectionString: live.url, max: 4 });
    await advanceLive();

    const digest = await cli(restored.url, ['digest']);
    expect(digest).toMatchObject({ code: 0, stderr: '' });
    const expected = streamDigestsSchema.parse(JSON.parse(digest.stdout));
    expect(
      expected.streams.map(({ campaignId, version, violations }) => ({
        campaignId,
        version,
        violations,
      })),
    ).toEqual([{ campaignId: 'ravenford', version: seeded, violations: 0 }]);

    const compared = await cli(
      live.url,
      ['compare', '--expected', '-', '--dumped-at', dumpedAt],
      digest.stdout,
    );
    expect(compared.code).toBe(0);
    expect(JSON.parse(compared.stdout)).toMatchObject({
      compared: 1,
      matched: 1,
      streams: [{ campaignId: 'ravenford', version: seeded, status: 'match', head: seeded + 1 }],
      unrestored: [],
      failures: [],
    });
    const at = await cli(live.url, ['digest', '--at', `ravenford=${String(seeded)}`]);
    expect(JSON.parse(at.stdout)).toEqual(expected);
  }, 60_000);

  it('fails on a different digest, a missing stream, and a stream the database does not reach', async () => {
    const digest = await cli(live.url, ['digest']);
    const [stream] = (JSON.parse(digest.stdout) as { streams: Record<string, unknown>[] }).streams;
    const expected = {
      streams: [
        { ...stream, digest: ZERO_DIGEST },
        { ...stream, campaignId: 'nowhere' },
        { ...stream, version: seeded + 1 },
      ],
    };

    const compared = await cli(
      live.url,
      ['compare', '--dumped-at', dumpTime(), '--expected', '-'],
      JSON.stringify(expected),
    );
    expect(compared.code).toBe(1);
    expect(JSON.parse(compared.stdout)).toMatchObject({
      compared: 3,
      matched: 0,
      streams: [{ status: 'mismatch' }, { status: 'missing' }, { status: 'behind' }],
      failures: ['different'],
    });
    expect((await cli(live.url, ['digest', '--at', `ravenford=${String(seeded + 1)}`])).code).toBe(
      1,
    );
  }, 60_000);

  it('fails on an empty restore unless the operator allows it, and on a live stream the dump lost', async () => {
    const empty = JSON.stringify({ streams: [] });
    const verdict = async (args: readonly string[], expected = empty) => {
      const result = await cli(live.url, ['compare', '--expected', '-', ...args], expected);
      return { code: result.code, ...(JSON.parse(result.stdout) as Record<string, unknown>) };
    };

    // An empty restore while the live campaign came later: legitimate only when said so.
    expect(await verdict(['--dumped-at', LONG_AGO])).toMatchObject({
      code: 1,
      compared: 0,
      failures: ['empty'],
    });
    expect(await verdict(['--dumped-at', LONG_AGO, '--allow-empty'])).toMatchObject({
      code: 0,
      compared: 0,
      unrestored: [],
      failures: [],
    });
    // The live campaign existed when the dump was taken: an empty restore lost it.
    expect(await verdict(['--allow-empty', '--dumped-at', inOneMinute()])).toMatchObject({
      code: 1,
      unrestored: [{ campaignId: 'ravenford', version: seeded }],
      failures: ['unrestored'],
    });

    // A restore holding Ravenford but not a campaign created before the dump: what it holds
    // matches, the drill still fails.
    const digest = await cli(live.url, ['digest']);
    await copyLiveStream('second-campaign');
    expect(await verdict(['--dumped-at', inOneMinute()], digest.stdout)).toMatchObject({
      code: 1,
      compared: 1,
      matched: 1,
      unrestored: [{ campaignId: 'second-campaign' }],
      failures: ['unrestored'],
    });
    // A campaign created after the dump is not expected in it.
    expect(await verdict(['--dumped-at', LONG_AGO], digest.stdout)).toMatchObject({
      code: 0,
      matched: 1,
      failures: [],
    });
  }, 60_000);

  it('refuses malformed requests', async () => {
    for (const args of [
      [],
      ['digest', '--at', 'ravenford'],
      ['compare'],
      ['compare', '--expected', '-'],
      ['compare', '--expected', '-', '--dumped-at', '2026-02-30T12:00:00Z'],
      ['compare', '--expected', '-', '--dumped-at', '2026-10-16 12:00:00'],
      ['compare', '--expected', '-', '--dumped-at', LONG_AGO, '--allow-empty', '--allow-empty'],
      ['compare', '--expected', '-', '--expected', '-', '--dumped-at', LONG_AGO],
      ['replay'],
    ]) {
      expect((await cli(live.url, args)).code).toBe(2);
    }
    const garbage = await cli(
      live.url,
      ['compare', '--expected', '-', '--dumped-at', LONG_AGO],
      'not json',
    );
    expect(garbage.code).toBe(1);
    expect(garbage.stderr).toMatch(/^replay-digest: failed \(SyntaxError/);
  }, 60_000);
});
