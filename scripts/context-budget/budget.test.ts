import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HARD_LIMIT, TARGET_LIMIT, checkContextBudget, countLines } from './budget.ts';

const lines = (count: number) => 'x;\n'.repeat(count);

describe('countLines', () => {
  it.each([
    ['', 0],
    ['a', 1],
    ['a\n', 1],
    ['a\nb', 2],
    ['a\nb\n', 2],
    ['\n\n', 2],
  ])('counts %j as %i lines', (content, expected) => {
    expect(countLines(content)).toBe(expected);
  });
});

describe('checkContextBudget', () => {
  let root: string;

  const put = async (path: string, content: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ltw-budget-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('passes files at exactly the hard limit and fails one line above', async () => {
    await put('packages/domain/src/at-limit.ts', lines(HARD_LIMIT));
    await put('packages/domain/src/over-limit.ts', lines(HARD_LIMIT + 1));

    const report = await checkContextBudget(root);

    expect(report.violations).toEqual([
      { path: 'packages/domain/src/over-limit.ts', lines: HARD_LIMIT + 1 },
    ]);
    expect(report.warnings).toEqual([
      { path: 'packages/domain/src/at-limit.ts', lines: HARD_LIMIT },
    ]);
  });

  it("counts the native apps' Swift, Kotlin and Gradle scripts, never their tool state", async () => {
    await put('apps/ios/LTWShell/Sources/Shell.swift', lines(HARD_LIMIT + 1));
    await put('apps/android/app/src/main/java/Main.kt', lines(HARD_LIMIT + 1));
    await put('apps/android/app/build.gradle.kts', lines(HARD_LIMIT + 1));
    await put('apps/android/.gradle/state.kts', lines(HARD_LIMIT + 1));
    await put('apps/android/.kotlin/session.kt', lines(HARD_LIMIT + 1));

    const report = await checkContextBudget(root);

    expect(report.violations.map((file) => file.path).sort()).toEqual([
      'apps/android/app/build.gradle.kts',
      'apps/android/app/src/main/java/Main.kt',
      'apps/ios/LTWShell/Sources/Shell.swift',
    ]);
  });

  it('warns above the target size without failing', async () => {
    await put('apps/server/src/target.ts', lines(TARGET_LIMIT));
    await put('apps/server/src/above-target.ts', lines(TARGET_LIMIT + 1));

    const report = await checkContextBudget(root);

    expect(report.violations).toEqual([]);
    expect(report.warnings.map((file) => file.path)).toEqual(['apps/server/src/above-target.ts']);
  });

  it.each([
    'tests/e2e/flow.spec.ts',
    'apps/server/src/thing.test.ts',
    'apps/web/src/styles/main.css',
    'apps/web/src/styles/theme.scss',
    'apps/server/migrations/0001_big.sql',
    'scripts/tool.mjs',
    'fixtures/ravenford/builders.ts',
  ])('enforces the limit on active file %s', async (path) => {
    await put(path, lines(HARD_LIMIT + 1));

    expect((await checkContextBudget(root)).violations.map((file) => file.path)).toEqual([path]);
  });

  it.each([
    'node_modules/pkg/index.js',
    'apps/server/node_modules/pkg/index.js',
    'apps/server/dist/main.js',
    'apps/web/build/bundle.js',
    'coverage/lcov-report/index.js',
    'packages/contracts/src/generated/schema.ts',
    'packages/contracts/src/__generated__/schema.ts',
    'packages/contracts/src/api.generated.ts',
    'apps/web/public/vendor.min.js',
    'fixtures/ravenford/world.json',
    'fixtures/ravenford/events.csv',
    'docs/long-document.md',
    'pnpm-lock.yaml',
  ])('excludes generated, dependency, build, dataset, and doc file %s', async (path) => {
    await put(path, lines(HARD_LIMIT * 3));

    const report = await checkContextBudget(root);

    expect(report.violations).toEqual([]);
    expect(report.checked).toBe(0);
  });
});

describe('context-budget CLI', () => {
  const cli = fileURLToPath(new URL('./cli.ts', import.meta.url));
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ltw-budget-cli-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('exits 1 and names the file when a file exceeds the hard limit', async () => {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src/huge.ts'), lines(HARD_LIMIT + 1));

    const run = promisify(execFile)(process.execPath, [cli, root]);

    await expect(run).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('src/huge.ts: 701 lines') as unknown,
    });
  });

  it('exits 0 when every active file is within budget', async () => {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src/ok.ts'), lines(10));

    const { stdout } = await promisify(execFile)(process.execPath, [cli, root]);

    expect(stdout).toContain('1 active files checked');
  });
});
