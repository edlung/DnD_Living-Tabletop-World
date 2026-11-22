import { spawnSync } from 'node:child_process';

/**
 * ESLint over the whole repository, one part at a time (`pnpm run lint`). Type-aware linting of
 * everything in one process needed 6.8 GB on 2026-11-22 and died on a hosted runner, whose
 * machine has 7 GB; each part below stays under 4.5 GB with a 4 GB heap. The last part is
 * everything the named ones leave, so nothing is skipped when a folder is added. Arguments are
 * passed to every part (`pnpm run lint -- --fix`).
 */
const PARTS = ['apps/web', 'apps/server', 'packages', 'scripts'];
const rest = ['.', ...PARTS.flatMap((part) => ['--ignore-pattern', `${part}/**`])];
const extra = process.argv.slice(2);

for (const part of [...PARTS.map((path) => [path]), rest]) {
  const run = spawnSync(
    process.execPath,
    [
      '--max-old-space-size=4096',
      'node_modules/eslint/bin/eslint.js',
      ...part,
      '--max-warnings=0',
      ...extra,
    ],
    { stdio: 'inherit' },
  );
  if (run.status !== 0) process.exit(run.status ?? 1);
}
