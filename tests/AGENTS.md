# Repository-level Tests

Cross-cutting tests that do not belong to one package. Package behavior is tested next to its source (`src/**/*.test.ts`).

- `architecture/` — workspace boundary enforcement (`workspace-boundaries.json`, `docs/adr/0004-module-boundaries.md`).
- Future cross-package scenario and E2E suites go in their own folders here, split by behavior or user scenario, with shared fixtures in small support modules.
