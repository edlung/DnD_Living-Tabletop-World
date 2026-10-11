import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { HISTORICAL_EVIDENCE, createRunDirectory } from './eval-output.ts';
import { parseEvalArgs, runEval, type EvalDeps } from './eval-run.ts';
import { RUNNERS, offlineEnv } from './eval-runners.ts';

/**
 * The evaluation CLI at remediation checkpoint A: live mode refuses before anything is
 * configured or constructed; offline runs write a fresh immutable directory, never the
 * historical evidence, and read the effective relevance deadline.
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

describe('eval:ai at checkpoint A', () => {
  it('refuses live mode, and any mode but --offline, before constructing anything', async () => {
    for (const argv of [[], ['--live'], ['reasoning'], ['--offline', '--live'], ['--bogus']]) {
      expect(parseEvalArgs(argv).kind).toBe('refused');
    }
    const runner = vi.fn();
    const lines: string[] = [];
    const deps: EvalDeps = {
      env: KEYS,
      runners: {
        reasoning: runner,
        'npc-dialogue': runner,
        narrative: runner,
        'fast-context': runner,
      },
      log: (line) => lines.push(line),
      now: () => new Date('2026-10-11T00:00:00Z'),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await runEval(['--live', '--out', await scratch()], deps)).toBe(2);
    expect(await runEval([], deps)).toBe(2);
    expect(runner).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(lines.join('\n')).toMatch(/refused/);
    expect(lines.join('\n')).not.toContain('sk-');
  });

  it('never lets an offline run see provider keys or routes', () => {
    expect(
      offlineEnv({ ...KEYS, LTW_AI_ROUTES: 'reasoning=anthropic:x', NODE_ENV: 'test' }),
    ).toEqual({
      NODE_ENV: 'test',
    });
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

  it('runs offline into its own directory with the effective relevance deadline', async () => {
    const root = await scratch();
    await writeFile(join(root, 'keep.txt'), 'unchanged');
    const lines: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const code = await runEval(['--offline', 'fast-context', '--out', root], {
      env: { ...KEYS, LTW_AI_RELEVANCE_BUDGET_MS: '1234', NODE_ENV: 'test' },
      runners: RUNNERS,
      log: (line) => lines.push(line),
      now: () => new Date('2026-10-11T00:00:00Z'),
    });
    expect(code).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    const [runDir, ...others] = (await readdir(root)).filter((name) => name !== 'keep.txt');
    expect(others).toEqual([]);
    expect(runDir).toMatch(/^offline-2026-10-11T00-00-00\.000Z-[0-9a-f]{8}$/);
    const report = await readFile(join(root, runDir ?? '', 'eval-report.md'), 'utf8');
    expect(report).toMatch(/OFFLINE/);
    expect(report).toContain('deadline 1234 ms');
    expect(report).not.toMatch(/deadline 2000/);
    const manifest = JSON.parse(
      await readFile(join(root, runDir ?? '', 'manifest.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      mode: 'offline',
      live: false,
      capabilities: ['fast-context'],
    });
    expect(await readFile(join(root, 'keep.txt'), 'utf8')).toBe('unchanged');
  });
});
