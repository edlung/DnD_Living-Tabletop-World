import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Verifies that workspace manifests and build wiring follow the dependency
 * graph declared in workspace-boundaries.json (docs/adr/0004-module-boundaries.md).
 * Import-level enforcement is covered by eslint-boundaries.test.ts.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

interface Boundaries {
  moduleGroups: Record<string, string[]>;
  packages: Record<string, { path: string; mayDependOn: string[]; forbiddenGroups: string[] }>;
}

interface Manifest {
  name: string;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(join(ROOT, path), 'utf8')) as T;

const boundaries = await readJson<Boundaries>('workspace-boundaries.json');
const entries = Object.entries(boundaries.packages);

const workspaceDirs = (
  await Promise.all(
    ['apps', 'packages'].map(async (parent) =>
      (await readdir(join(ROOT, parent), { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${parent}/${entry.name}`),
    ),
  )
).flat();

const manifests = new Map(
  await Promise.all(
    workspaceDirs.map(
      async (dir) => [dir, await readJson<Manifest>(`${dir}/package.json`)] as const,
    ),
  ),
);

const allDependencies = (manifest: Manifest) =>
  Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
  });

const matchesModule = (dependency: string, pattern: string) =>
  pattern.endsWith('/*')
    ? dependency.startsWith(pattern.slice(0, -1)) || dependency === pattern.slice(0, -2)
    : dependency === pattern;

describe('workspace boundaries', () => {
  it('declares every workspace directory exactly once, at its real path', () => {
    const declared = entries.map(([name, rule]) => [rule.path, name]).sort();
    const actual = [...manifests].map(([dir, manifest]) => [dir, manifest.name]).sort();

    expect(actual).toEqual(declared);
  });

  it('declares a dependency graph that is acyclic and references known packages', () => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (name: string): void => {
      if (done.has(name)) return;
      expect(visiting.has(name), `dependency cycle through ${name}`).toBe(false);
      visiting.add(name);
      for (const next of boundaries.packages[name]?.mayDependOn ?? []) {
        expect(boundaries.packages[next], `${name} -> unknown ${next}`).toBeDefined();
        visit(next);
      }
      visiting.delete(name);
      done.add(name);
    };
    entries.forEach(([name]) => {
      visit(name);
    });
  });

  it('keeps clients and pure layers off the server and each other', () => {
    for (const [name, rule] of entries) {
      expect(rule.mayDependOn.filter((dep) => dep.startsWith('@ltw/') && dep !== name)).toEqual(
        rule.mayDependOn,
      );
      if (name !== '@ltw/server') expect(rule.mayDependOn).not.toContain('@ltw/server');
    }
    for (const client of ['@ltw/web', '@ltw/ui']) {
      expect(boundaries.packages[client]?.mayDependOn).not.toContain('@ltw/domain');
      expect(boundaries.packages[client]?.mayDependOn).not.toContain('@ltw/rules');
      expect(boundaries.packages[client]?.mayDependOn).not.toContain('@ltw/context');
      expect(boundaries.packages[client]?.forbiddenGroups).toContain('ai-providers');
    }
  });

  it.each(entries)('%s declares only permitted dependencies', (_name, rule) => {
    const manifest = manifests.get(rule.path);
    if (!manifest) throw new Error(`missing manifest for ${rule.path}`);
    const dependencies = allDependencies(manifest);

    const workspaceDeps = dependencies.filter((dep) => dep.startsWith('@ltw/'));
    expect(workspaceDeps.filter((dep) => !rule.mayDependOn.includes(dep))).toEqual([]);

    const forbidden = rule.forbiddenGroups.flatMap((group) => boundaries.moduleGroups[group] ?? []);
    expect(
      dependencies.filter((dep) => forbidden.some((pattern) => matchesModule(dep, pattern))),
    ).toEqual([]);
  });

  it.each(entries.filter(([, rule]) => rule.path.startsWith('packages/')))(
    '%s exposes a single public entry point',
    (_name, rule) => {
      const manifest = manifests.get(rule.path);
      expect(Object.keys(manifest?.exports ?? {})).toEqual(['.']);
      expect(manifest?.exports?.['.']).toEqual({
        '@ltw/source': './src/index.ts',
        types: './dist/index.d.ts',
        default: './dist/index.js',
      });
    },
  );

  it('builds every workspace project, each confined to its own src/', async () => {
    const build = await readJson<{ references: { path: string }[] }>('tsconfig.build.json');
    expect(build.references.map((ref) => ref.path).sort()).toEqual(
      entries.map(([, rule]) => `${rule.path}/tsconfig.build.json`).sort(),
    );

    for (const [, rule] of entries) {
      const config = await readJson<{ compilerOptions: Record<string, unknown> }>(
        `${rule.path}/tsconfig.build.json`,
      );
      expect(config.compilerOptions).toMatchObject({ composite: true, rootDir: 'src' });
    }
  });
});
