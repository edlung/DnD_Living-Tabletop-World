// @ts-check
import { readFileSync } from 'node:fs';

import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Module boundaries come from workspace-boundaries.json so ESLint and
 * tests/architecture/ enforce the same dependency graph.
 * @typedef {{ path: string, mayDependOn: string[], forbiddenGroups: string[], forbiddenNames?: Record<string, string[]>, entryPoints?: Record<string, string>, browser?: boolean }} PackageRule
 * @typedef {{ moduleGroups: Record<string, string[]>, packages: Record<string, PackageRule> }} Boundaries
 */
const boundaries = /** @type {Boundaries} */ (
  JSON.parse(readFileSync(new URL('./workspace-boundaries.json', import.meta.url), 'utf8'))
);
const workspacePackages = Object.keys(boundaries.packages);
/** The further public entry points ("@ltw/contracts/srd-items"): for server-side packages only. */
const furtherEntryPoints = Object.entries(boundaries.packages).flatMap(([name, rule]) =>
  Object.keys(rule.entryPoints ?? {}).map((subpath) => `${name}/${subpath.replace(/^\.\//, '')}`),
);

const boundaryConfigs = Object.entries(boundaries.packages).flatMap(([name, rule]) => {
  const disallowedWorkspace = workspacePackages.filter(
    (other) => other !== name && !rule.mayDependOn.includes(other),
  );
  const patterns = [
    {
      group: ['@ltw/*/*', ...(rule.browser ? [] : furtherEntryPoints.map((entry) => `!${entry}`))],
      message: rule.browser
        ? 'Import workspace packages through their main entry point only: the further ones hold server-side data the browser must not carry.'
        : 'Import workspace packages through their public entry points only.',
    },
    ...(disallowedWorkspace.length > 0
      ? [
          {
            group: disallowedWorkspace,
            message: `${name} may depend only on: ${rule.mayDependOn.join(', ') || '(no workspace packages)'}. See docs/adr/0004-module-boundaries.md.`,
          },
        ]
      : []),
    ...rule.forbiddenGroups.map((group) => ({
      group: boundaries.moduleGroups[group] ?? [],
      message: `${name} must not import ${group} modules (ARCHITECTURE_INVARIANTS.md; docs/adr/0004-module-boundaries.md).`,
    })),
  ];
  const files = [`${rule.path}/**/*.{ts,tsx,js,mjs}`];
  const base = {
    name: `ltw/boundaries/${name}`,
    files,
    rules: { 'no-restricted-imports': ['error', { patterns }] },
  };
  const named = Object.entries(rule.forbiddenNames ?? {});
  if (named.length === 0) return [base];
  // Named exports barred from production sources; tests and testing/ may seed through them.
  const paths = named.map(([module, importNames]) => ({
    name: module,
    importNames,
    message: `${name} must not use these ${module} exports outside tests (docs/adr/0004-module-boundaries.md).`,
  }));
  return [
    base,
    {
      name: `ltw/boundaries/${name}/names`,
      files,
      ignores: [`${rule.path}/**/*.test.ts`, `${rule.path}/**/testing/**`],
      rules: { 'no-restricted-imports': ['error', { paths, patterns }] },
    },
  ];
});

export default defineConfig(
  {
    name: 'ltw/ignores',
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
      // Review evidence: probes kept as reviewers ran them, not project code.
      'reviews/evidence/**',
      // Other checkouts of this repository (Claude Code session worktrees).
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    name: 'ltw/typescript',
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
    },
  },
  {
    // Root JS tool configs are not part of the TypeScript program.
    ...tseslint.configs.disableTypeChecked,
    name: 'ltw/root-js-configs',
    files: ['*.js'],
  },
  {
    // The native apps' shim (docs/adr/0070-native-apps.md §2): a classic script both shells inject,
    // its config placeholder replaced before it runs; not part of the TypeScript program.
    ...tseslint.configs.disableTypeChecked,
    name: 'ltw/native-shim',
    files: ['apps/native-shim/**/*.js'],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      sourceType: 'script',
      globals: { ...globals.browser, __LTW_NATIVE_CONFIG__: 'readonly' },
    },
  },
  {
    name: 'ltw/cli-entry-points',
    files: ['scripts/**/cli.ts', 'apps/server/src/**/*-cli.ts', 'apps/server/src/main.ts'],
    rules: { 'no-console': 'off' },
  },
  ...boundaryConfigs,
  prettier,
);
