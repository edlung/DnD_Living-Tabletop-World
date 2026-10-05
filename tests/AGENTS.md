# Repository-level Tests

Cross-cutting tests that do not belong to one package. Package behavior is tested next to its source (`src/**/*.test.ts`).

- `architecture/` — workspace boundary enforcement (`workspace-boundaries.json`, `docs/adr/0004-module-boundaries.md`).
- `e2e/` — Stage 200 real browser/API journeys. Start with `e2e/AGENTS.md`; Playwright uses dedicated in-memory HTTP and Vite servers.
- Later cross-package suites remain split by behavior or user scenario, with shared fixtures in small support modules.
