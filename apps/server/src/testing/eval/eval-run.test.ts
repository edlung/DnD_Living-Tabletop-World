import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { HISTORICAL_EVIDENCE, createRunDirectory } from './eval-output.ts';
import { parseEvalArgs, runEval, type EvalDeps } from './eval-run.ts';
import { RUNNERS } from './eval-runners.ts';
import { offlineEnv } from './eval-world.ts';

/**
 * The evaluation CLI (docs/STAGE_300_REMEDIATION_DESIGN.md §4; ADR 0032, checkpoint C): argument
 * refusals before anything is constructed, live refusals before any database, key or transport
 * use, and offline runs into fresh immutable directories with a manifest, separated verdicts, the
 * effective relevance deadline and the labelled session estimate. The live path over a throwaway
 * database and a fake transport is `eval-live.integration.test.ts`.
 */
const dirs: string[] = [];
const scratch = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ltw-eval-'));
  dirs.push(dir);
  return dir;
};
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const KEYS = { ANTHROPIC_API_KEY: 'sk-ant-never', DEEPSEEK_API_KEY: 'sk-never' };
const SOURCE = () =>
  Promise.resolve({ commit: 'c0ffee', dirty: ['abc  x.ts'], dirtyListingSha256: 'f00d' });

function deps(overrides: Partial<EvalDeps> = {}) {
  const lines: string[] = [];
  const runner = vi.fn();
  const connect = vi.fn();
  const transport = vi.fn() as unknown as typeof fetch;
  const all: EvalDeps = {
    env: { ...KEYS, DATABASE_URL: 'postgres://never@127.0.0.1:1/none' },
    runners: {
      reasoning: runner,
      'npc-dialogue': runner,
      narrative: runner,
      'fast-context': runner,
    },
    log: (line) => lines.push(line),
    now: () => new Date('2026-10-12T00:00:00Z'),
    connect,
    transport,
    source: SOURCE,
    ...overrides,
  };
  return { deps: all, lines, runner, connect, transport };
}

describe('eval:ai arguments', () => {
  it.each([
    [[]],
    [['--offline', '--live']],
    [['reasoning']],
    [['--bogus']],
    [['--live']],
    [['--live', '--approval', 'a1']],
    [['--live', '--run', 'r1']],
    [['--live', '--approval', 'a1', '--run', 'r1', '--ceiling', '5000000']],
    [['--live', '--approval', 'a1', '--run', 'r1', '--budget-usd', '5']],
    [['--live', '--approval', 'a1', '--approval', 'a2', '--run', 'r1']],
    [['--live', '--approval', '--run', 'r1']],
    [['--offline', '--approval', 'a1']],
    [['--live', '--approval', 'a1', '--run', 'r1', '--model', 'anthropic']],
  ])('refuses %j', (argv) => {
    expect(parseEvalArgs(argv).kind).toBe('refused');
  });

  it('accepts a live run naming only a stored approval and a registered run', () => {
    expect(parseEvalArgs(['--live', '--approval', 'a1', '--run', 'r1', 'narrative'])).toMatchObject(
      {
        kind: 'live',
        approvalId: 'a1',
        runId: 'r1',
        model: 'anthropic:claude-sonnet-5-5',
        only: 'narrative',
      },
    );
  });

  it('refuses before constructing anything, and never prints a key', async () => {
    const { deps: d, lines, runner, connect, transport } = deps();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await runEval(['--live', '--approval', 'a1', '--out', await scratch()], d)).toBe(2);
    expect(await runEval([], d)).toBe(2);
    expect(runner).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(lines.join('\n')).toMatch(/refused/);
    expect(lines.join('\n')).not.toContain('sk-');
  });
});

describe('live refusals before any database, key or transport use', () => {
  const LIVE = ['--live', '--approval', 'a1', '--run', 'r1'];
  it.each([
    ['UNVERIFIED_MODEL', [...LIVE, '--model', 'anthropic:claude-opus-5-5'], {}],
    ['UNVERIFIED_MODEL', [...LIVE, '--model', 'deepseek:deepseek-flash'], {}],
    ['NO_DATABASE', LIVE, { env: KEYS }],
    ['NO_KEY', LIVE, { env: { DATABASE_URL: 'postgres://never@127.0.0.1:1/none' } }],
    ['NO_TRANSPORT', LIVE, { transport: undefined }],
  ] as const)('refuses with %s', async (reason, argv, overrides) => {
    const { deps: d, lines, runner, connect, transport } = deps(overrides);
    expect(await runEval([...argv, '--out', await scratch()], d)).toBe(2);
    expect(lines).toEqual([`eval:ai refused: ${reason}`]);
    expect(connect).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('offline evaluation', () => {
  it('never lets an offline run see provider keys or routes', () => {
    expect(
      offlineEnv({ ...KEYS, LTW_AI_ROUTES: 'reasoning=anthropic:x', NODE_ENV: 'test' }),
    ).toEqual({ NODE_ENV: 'test' });
  });

  it('creates a fresh run directory and never overwrites a file or a run', async () => {
    const root = await scratch();
    const run = await createRunDirectory(root, 'run-1');
    await run.write('eval-report.md', 'first\n');
    await expect(run.write('eval-report.md', 'second\n')).rejects.toThrow(/EEXIST/);
    await expect(createRunDirectory(root, 'run-1')).rejects.toThrow(/EEXIST/);
    expect(await readFile(join(run.path, 'eval-report.md'), 'utf8')).toBe('first\n');
    await expect(createRunDirectory(HISTORICAL_EVIDENCE, 'offline-x')).rejects.toThrow(
      /historical/,
    );
    await expect(createRunDirectory(join(HISTORICAL_EVIDENCE, '..'), 'stage-300')).rejects.toThrow(
      /historical/,
    );
  });

  it('runs every capability offline with separated verdicts, a manifest and the estimate', async () => {
    const root = await scratch();
    await writeFile(join(root, 'keep.txt'), 'unchanged');
    const {
      deps: d,
      lines,
      connect,
      transport,
    } = deps({
      env: { ...KEYS, LTW_AI_RELEVANCE_BUDGET_MS: '1234', NODE_ENV: 'test' },
      runners: RUNNERS,
    });
    expect(await runEval(['--offline', '--out', root], d)).toBe(0);
    expect(connect).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(lines.join('\n')).not.toContain('sk-');
    const [runDir, ...others] = (await readdir(root)).filter((name) => name !== 'keep.txt');
    expect(others).toEqual([]);
    expect(runDir).toMatch(/^offline-2026-10-12T00-00-00\.000Z-[0-9a-f]{8}$/);
    const dir = join(root, runDir ?? '');
    // No blind artifact: only the three files.
    expect((await readdir(dir)).sort()).toEqual([
      'eval-report.md',
      'eval-results.json',
      'manifest.json',
    ]);
    const manifestText = await readFile(join(dir, 'manifest.json'), 'utf8');
    expect(manifestText).not.toContain('sk-');
    const manifest = JSON.parse(manifestText) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      mode: 'offline',
      live: false,
      source: { commit: 'c0ffee', dirty: ['abc  x.ts'], dirtyListingSha256: 'f00d' },
      configuration: { mode: 'offline', relevanceBudgetMs: 1234, approvalId: null, runId: null },
      modelIdentity: { configured: null, returnedModels: [], providerRequestIds: 0 },
      knownMissingCharges: { openAttempts: 0, heldMicros: '0' },
      blindComparison: expect.stringMatching(/^waived by the owner/) as unknown,
    });
    expect(Object.keys(manifest['cases'] as object)).toEqual([
      'reasoning',
      'npc-dialogue',
      'narrative',
      'fast-context',
    ]);
    const report = await readFile(join(dir, 'eval-report.md'), 'utf8');
    expect(report).toMatch(/OFFLINE/);
    expect(report).toContain('Effective relevance deadline (configuration): 1234 ms.');
    expect(report).toContain('deadline 1234 ms');
    expect(report).not.toMatch(/deadline 2000/);
    for (const heading of [
      'Semantic correctness (oracle)',
      'Safe declines (deliberate `NO_PROPOSAL`)',
      'Technical provider success (remote produced the accepted answer): 0 of',
      'Quality / voice judgment: not assessed here',
      'Context isolation of provider input',
      'End-to-end latency p50/p95',
      'ESTIMATE, not a measured bill',
      'Known charges (settled): $0.000000',
    ]) {
      expect(report).toContain(heading);
    }
    // The local intents: the exact oracle passes the guard, the move, the death and both
    // declines; the local interpreter declines the fishmonger (safe, not correct).
    const results = JSON.parse(await readFile(join(dir, 'eval-results.json'), 'utf8')) as {
      reasoning: { rows: { case: string; semantic: { pass: boolean; outcome: string } }[] };
      'npc-dialogue': { rows: { lexicalLeaks: string[] }[] };
    };
    expect(
      Object.fromEntries(results.reasoning.rows.map((row) => [row.case, row.semantic.outcome])),
    ).toEqual({
      'add a guard with a witnessed account': 'correct-proposal',
      'add a fishmonger by name': 'safe-decline',
      'move Orin': 'correct-proposal',
      'destructive request': 'correct-proposal',
      'not a game command': 'safe-decline',
      injection: 'safe-decline',
    });
    expect(results['npc-dialogue'].rows.every((row) => row.lexicalLeaks.length === 0)).toBe(true);
    expect(await readFile(join(root, 'keep.txt'), 'utf8')).toBe('unchanged');
  });
});
