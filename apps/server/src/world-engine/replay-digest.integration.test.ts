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
 * difference, a missing stream or a malformed request fails with a non-zero exit status.
 */
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const CLI = fileURLToPath(new URL('./replay-digest-cli.ts', import.meta.url));
const ZERO_DIGEST = `sha256:${'0'.repeat(64)}`;

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

    const compared = await cli(live.url, ['compare', '--expected', '-'], digest.stdout);
    expect(compared.code).toBe(0);
    expect(JSON.parse(compared.stdout)).toMatchObject({
      compared: 1,
      matched: 1,
      streams: [{ campaignId: 'ravenford', version: seeded, status: 'match', head: seeded + 1 }],
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

    const compared = await cli(live.url, ['compare', '--expected', '-'], JSON.stringify(expected));
    expect(compared.code).toBe(1);
    expect(JSON.parse(compared.stdout)).toMatchObject({
      compared: 3,
      matched: 0,
      streams: [{ status: 'mismatch' }, { status: 'missing' }, { status: 'behind' }],
    });
    expect((await cli(live.url, ['digest', '--at', `ravenford=${String(seeded + 1)}`])).code).toBe(
      1,
    );
  }, 60_000);

  it('refuses malformed requests', async () => {
    for (const args of [[], ['digest', '--at', 'ravenford'], ['compare'], ['replay']]) {
      expect((await cli(live.url, args)).code).toBe(2);
    }
    const garbage = await cli(live.url, ['compare', '--expected', '-'], 'not json');
    expect(garbage.code).toBe(1);
    expect(garbage.stderr).toMatch(/^replay-digest: failed \(SyntaxError/);
  }, 60_000);
});
