# Repository-level Tests

Cross-cutting tests that do not belong to one package. Package behavior is tested next to its source (`src/**/*.test.ts`).

- `architecture/` — workspace boundary enforcement (`workspace-boundaries.json`, `docs/adr/0004-module-boundaries.md`).
- `setup/no-network.ts` — every Vitest project's setup file (`vitest.config.ts`): the global `fetch` is a trap, and a test that calls it fails (ADR 0032, checkpoint C). Inject a fake transport instead; `architecture/no-network*.test.ts` prove the trap is active in both projects by its registry symbol, without importing the setup file (so they fail if the configuration stops installing it).
- `i18n/` — dictionary coverage (`docs/adr/0031-play-language.md`): every English client string and every authoring sentence has a Russian entry with the same placeholders. They read sources, so they live here, not in a package.
- `ui-kit/` — the GPT-made UI kit's provenance (ADR 0034): every shipped picture has a manifest entry from the OpenAI image model, every entry has its file, and the client's URL maps name exactly the files.
- `evidence/` — screenshot tours (`pnpm evidence:screens`, `playwright.evidence.config.ts`); not run by `pnpm test:e2e` or CI. See `e2e/AGENTS.md`.
- `e2e/` — Stage 200 real browser/API journeys. Start with `e2e/AGENTS.md`; Playwright uses dedicated in-memory HTTP and Vite servers.
- Later cross-package suites remain split by behavior or user scenario, with shared fixtures in small support modules.
