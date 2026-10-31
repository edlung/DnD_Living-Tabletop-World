import { defineConfig } from 'vitest/config';

/**
 * Two projects:
 * - unit: fast, deterministic, no external services (`pnpm test`).
 * - integration: needs PostgreSQL from DATABASE_URL (`pnpm test:integration`).
 * Workspace packages resolve to their TypeScript sources via the
 * `@ltw/source` export condition, so tests never depend on a prior build.
 */
// `.claude/worktrees/` holds other checkouts of this repository (Claude Code sessions).
const exclude = ['**/node_modules/**', '**/dist/**', '**/.claude/**'];
export default defineConfig({
  ssr: { resolve: { conditions: ['@ltw/source', 'node', 'development|production'] } },
  test: {
    // Both projects: the global `fetch` is a trap (no test reaches the network; ADR 0032, C).
    setupFiles: ['./tests/setup/no-network.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['**/*.test.ts'],
          exclude: [...exclude, '**/*.integration.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['**/*.integration.test.ts'],
          exclude,
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
