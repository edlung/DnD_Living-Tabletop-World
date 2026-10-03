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
 * @typedef {{ path: string, mayDependOn: string[], forbiddenGroups: string[] }} PackageRule
 * @typedef {{ moduleGroups: Record<string, string[]>, packages: Record<string, PackageRule> }} Boundaries
 */
const boundaries = /** @type {Boundaries} */ (
  JSON.parse(readFileSync(new URL('./workspace-boundaries.json', import.meta.url), 'utf8'))
);
const workspacePackages = Object.keys(boundaries.packages);

const boundaryConfigs = Object.entries(boundaries.packages).map(([name, rule]) => {
  const disallowedWorkspace = workspacePackages.filter(
    (other) => other !== name && !rule.mayDependOn.includes(other),
  );
  const patterns = [
    {
      group: ['@ltw/*/*'],
      message: 'Import workspace packages through their public entry point only.',
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
  return {
    name: `ltw/boundaries/${name}`,
    files: [`${rule.path}/**/*.{ts,tsx,js,mjs}`],
    rules: { 'no-restricted-imports': ['error', { patterns }] },
  };
});

export default defineConfig(
  {
    name: 'ltw/ignores',
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**'],
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
    name: 'ltw/cli-entry-points',
    files: ['scripts/**/cli.ts', 'apps/server/src/**/*-cli.ts'],
    rules: { 'no-console': 'off' },
  },
  ...boundaryConfigs,
  prettier,
);
