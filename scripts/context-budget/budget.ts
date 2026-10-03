import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

/**
 * Context-budget policy (AGENTS.md, work-orders/OPUS_STAGE_000.md #13).
 *
 * Every hand-maintained active source, test, E2E, and stylesheet file must
 * stay at or below HARD_LIMIT lines; TARGET_LIMIT is the preferred size and
 * only produces a warning. Only dependency, build, and generated output are
 * excluded, plus datasets by virtue of their (non-code) file types.
 * Never add an exclusion merely to let hand-maintained code pass.
 */
export const HARD_LIMIT = 700;
export const TARGET_LIMIT = 500;

/** Active code and stylesheet file types. Data files (.json, .csv, .yaml, …) are datasets. */
export const ACTIVE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.sql',
  '.sh',
]);

/** Directory names holding dependency, build, generated, or tool-state output. */
export const EXCLUDED_DIRECTORIES: ReadonlySet<string> = new Set([
  '.git',
  '.claude',
  '.pnpm-store',
  '.turbo',
  '.vite',
  '.cache',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'generated',
  '__generated__',
]);

/** File-name suffixes of generated or minified output. */
export const EXCLUDED_SUFFIXES: readonly string[] = [
  '.generated.ts',
  '.generated.js',
  '.min.js',
  '.min.css',
];

export interface FileBudget {
  readonly path: string;
  readonly lines: number;
}

export interface BudgetReport {
  readonly checked: number;
  readonly violations: readonly FileBudget[];
  readonly warnings: readonly FileBudget[];
}

export function countLines(content: string): number {
  if (content === '') return 0;
  const newlines = content.split('\n').length - 1;
  return content.endsWith('\n') ? newlines : newlines + 1;
}

export function isActiveFile(name: string): boolean {
  return (
    ACTIVE_EXTENSIONS.has(extname(name)) &&
    !EXCLUDED_SUFFIXES.some((suffix) => name.endsWith(suffix))
  );
}

async function* walk(root: string, directory: string): AsyncGenerator<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) yield* walk(root, path);
    } else if (entry.isFile() && isActiveFile(entry.name)) {
      yield path;
    }
  }
}

export async function checkContextBudget(root: string): Promise<BudgetReport> {
  const violations: FileBudget[] = [];
  const warnings: FileBudget[] = [];
  let checked = 0;

  for await (const path of walk(root, root)) {
    checked += 1;
    const lines = countLines(await readFile(path, 'utf8'));
    const file = { path: relative(root, path).split(sep).join('/'), lines };
    if (lines > HARD_LIMIT) violations.push(file);
    else if (lines > TARGET_LIMIT) warnings.push(file);
  }

  const byPath = (a: FileBudget, b: FileBudget) => a.path.localeCompare(b.path);
  return { checked, violations: violations.sort(byPath), warnings: warnings.sort(byPath) };
}
