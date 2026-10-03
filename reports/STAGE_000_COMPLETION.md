# Stage 0 Completion Report — Repository Foundation

- Work order: `work-orders/OPUS_STAGE_000.md`
- Builder: Claude Opus 5.5 / HIGH (per `EFFORT_MATRIX.md`)
- Implementation revision: `fe37482ef810e14f79e3b566ad60c975254b038f` (branch `main`; this report is committed on top of it)
- Baseline: `8b15a1e` — unmodified Development Pack v1.2
- Formal gate: none at Stage 0 (no Astra handoff required)
- Status: **COMPLETE — awaiting owner authorization for Stage 10**

## Delivered

| #   | Deliverable                              | Where                                                                                                                                           |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Modular-monolith workspace               | `apps/server`, `apps/web`, `packages/{contracts,domain,rules,ui}`, `fixtures/ravenford`, `tests/`, `docs/adr/`                                  |
| 2   | Strict TypeScript, reproducible scripts  | `tsconfig.base.json`, `tsconfig.json`, `tsconfig.build.json`, `package.json`, `pnpm-lock.yaml`                                                  |
| 3   | Formatting, lint, typecheck              | Prettier, ESLint 10 `strictTypeChecked`, `tsc`                                                                                                  |
| 4   | Unit/integration tests                   | `vitest.config.ts` (unit, integration projects); 98 unit + 5 integration tests                                                                  |
| 5   | Database/migration infrastructure        | `apps/server/src/platform/db/`, `apps/server/migrations/`, `docker-compose.yml` — no domain schema                                              |
| 6   | CI                                       | `.github/workflows/ci.yml`; local equivalent `scripts/ci-local.sh`                                                                              |
| 7   | Structured logging                       | `apps/server/src/platform/logging/logger.ts`                                                                                                    |
| 8   | Config validation, safe dev defaults     | `apps/server/src/platform/config/config.ts`, `.env.example`                                                                                     |
| 9   | Module boundaries                        | `workspace-boundaries.json`, `eslint.config.js`, `tests/architecture/`, ADR 0004                                                                |
| 10  | ADR workflow                             | `docs/adr/` (README, template, ADRs 0001–0005); `docs/IMPLEMENTATION_PREREQUISITES.md` unchanged                                                |
| 11  | README with exact commands; Git revision | `README.md`; revision above                                                                                                                     |
| 12  | Context map and nested guidance          | `docs/AI_CONTEXT_MAP.md` (code/tooling table); `AGENTS.md` in `apps/server`, `apps/server/migrations`, `fixtures/ravenford`, `tests`, `reports` |
| 13  | Context-budget check                     | `scripts/context-budget/`; `pnpm context-budget` in `validate`, `ci-local.sh`, CI                                                               |
| 14  | This report                              | `reports/STAGE_000_COMPLETION.md`                                                                                                               |

## Validation (Node 25.8.1 local, pnpm 11.11.0, PostgreSQL 18 via Docker)

| Command                                                                                                      | Result                                                                                         |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                             | PASS (passes pnpm supply-chain release-age policy)                                             |
| `pnpm format:check`                                                                                          | PASS                                                                                           |
| `pnpm lint`                                                                                                  | PASS, 0 warnings                                                                               |
| `pnpm typecheck`                                                                                             | PASS                                                                                           |
| `pnpm context-budget`                                                                                        | PASS — 26 active files, 0 over 500, 0 over 700                                                 |
| `pnpm test`                                                                                                  | PASS — 7 files, 98 tests                                                                       |
| `pnpm clean && pnpm build`                                                                                   | PASS                                                                                           |
| `pnpm db:migrate` (fresh volume, then again)                                                                 | PASS — creates only `ltw_schema_migrations`; second run applies nothing                        |
| `pnpm test:integration`                                                                                      | PASS — 5 tests (bootstrap, ordered apply, atomic rollback, checksum drift, concurrent runners) |
| `pnpm validate:ci-local`                                                                                     | PASS — all steps above in CI order                                                             |
| Fresh `git clone` of `fe37482` → install, format, lint, typecheck, budget, test, build, migrate, integration | PASS                                                                                           |

Context-budget proof (temporary files, removed afterwards; nothing retained):

| Probe                                                                                        | Result                                      |
| -------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 701-line `packages/domain/src/__budget_probe__.ts`                                           | exit 1, `FAIL … 701 lines (hard limit 700)` |
| 2000-line files in `apps/server/dist/`, `packages/contracts/src/generated/`, `node_modules/` | exit 0, not counted                         |

Unit tests additionally cover the 700/701 boundary, 500 warning, `.css`/`.scss`/`.sql`/test/E2E inclusion, and exclusion of dependency, build, generated, minified, dataset (`.json`, `.csv`), and Markdown files.

Also verified manually: the server runs from source (`node apps/server/src/main.ts`) and from `dist`, answers `GET /healthz`, emits JSON logs with request IDs, and shuts down on SIGTERM; production start without `DATABASE_URL` fails with a `ConfigError`. A temporary cross-package probe (rules → domain) confirmed source resolution in tests/typecheck, correct `.d.ts` in the build, and `dist` resolution at runtime; it was reverted.

## Assumptions

- Node 24 LTS is the CI runtime; local Node 25 is supported (`engines: >=24`).
- TypeScript is pinned to 6.0 because `typescript-eslint` 8.x does not support TypeScript 7 (ADR 0002).
- Local PostgreSQL uses host port 54329 to avoid clashing with an installed PostgreSQL. Development credentials in `docker-compose.yml` are local-only and rejected in production.
- Owner-authored Development Pack Markdown at the root and in `work-orders/` is excluded from Prettier so tooling never rewrites it.

## Known Stage 0 limitations

- The GitHub Actions workflow has not run on GitHub: the repository has no remote yet. Its steps match `scripts/ci-local.sh`, which passes locally.
- No HTTP framework, ORM/query layer, web framework, vector index, or object storage is chosen; each is deferred to the stage that needs it (ADRs 0003–0005).
- Migrations must be transactional; non-transactional statements need a later ADR.
- `pnpm db:migrate` runs compiled output, so `pnpm build` must precede it.
- Server npm scripts print Node's "`.env` not found" notice when no `.env` exists; harmless.
- Fatal startup config errors print a stack trace to stderr rather than a structured log line.

## Decisions that block Stage 10

- **Temporal and undo contract ADR** (`docs/IMPLEMENTATION_PREREQUISITES.md`): supported temporal domains, identity, event ordering, recorded nondeterministic inputs, duplicate-command handling, atomicity, world time vs persistence time, and undo strategy. Stage 10 must draft it; the owner must approve the product semantics before the kernel persistence/replay contract is implemented.
- The data-access layer on top of `pg` is chosen in that same Stage 10 work (ADR 0003).

No other decision blocks Stage 10. The ruleset (Stage 40) and minimum authoring validation (Stage 110) remain pending and are not needed yet.
